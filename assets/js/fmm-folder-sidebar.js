/**
 * Fena Media Manager: folder sidebar of the media library grid (upload.php).
 *
 * Folder navigation, create/rename/delete, assigning the core "Bulk select"
 * selection to folders, and native drag-and-drop of grid items onto folders.
 * Uses only the public `wp-media-grid-ready` event, the library query props
 * and the frame selection; no core view is extended here.
 *
 * @package Fena_Media_Manager
 */

( function( $, _, wp ) {
	'use strict';

	var fmm = window.fmmMedia;

	if ( ! fmm || ! wp || ! wp.apiFetch || ! window.fmmPicker ) {
		return;
	}

	var __ = wp.i18n.__;
	var _n = wp.i18n._n;
	var sprintf = wp.i18n.sprintf;
	var store = fmm.store;
	var PROP = fmm.prop;
	var DRAG_TYPE = 'application/x-fmm-media';
	var FOLDER_DRAG_TYPE = 'application/x-fmm-folder';
	// Hover-capable desktop after a real pointer has been used: row actions are created on demand (see needsActions()).
	var LAZY_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 783px)';
	var COLOR_PRESETS = [ 'blue', 'violet', 'sand', 'green' ];
	var COLOR_HEX = /^#[0-9a-f]{6}$/i;
	var DEFAULT_CUSTOM_COLOR = '#7b61c9';

	/*
	 * Logical icon names, mapped to Heroicons symbols of the inline sprite
	 * (FMM_Icons, id "fmm-i-<name>").
	 */
	var ICONS = {
		all: 'photo',
		unassigned: 'inbox',
		folder: 'folder',
		'folder-open': 'folder-open',
		'folder-plus': 'plus',
		'folder-minus': 'minus',
		'folder-move': 'arrow-right',
		create: 'folder-plus',
		subfolder: 'plus',
		collapsed: 'chevron-right',
		expanded: 'chevron-down',
		rename: 'pencil-square',
		more: 'ellipsis-horizontal',
		'move-to': 'folder-arrow-down',
		color: 'swatch',
		'move-up': 'arrow-up',
		'move-down': 'arrow-down',
		'delete': 'trash',
		search: 'magnifying-glass',
		sort: 'bars-arrow-down',
		check: 'check',
		lock: 'lock-closed',
		unlock: 'lock-open',
		'notice-success': 'check',
		'notice-warning': 'exclamation-triangle',
		'notice-error': 'exclamation-circle',
		dismiss: 'x-mark'
	};

	var SVG_NS = 'http://www.w3.org/2000/svg';

	var iconCache = {};

	function iconEl( name ) {
		var node = iconCache[ name ];
		var use;

		if ( ! node ) {
			node = iconCache[ name ] = document.createElementNS( SVG_NS, 'svg' );
			use = document.createElementNS( SVG_NS, 'use' );
			node.setAttribute( 'class', 'fmm-icon fmm-icon--' + name );
			node.setAttribute( 'aria-hidden', 'true' );
			node.setAttribute( 'focusable', 'false' );
			use.setAttribute( 'href', '#fmm-i-' + ( ICONS[ name ] || name ) );
			node.appendChild( use );
		}

		return node.cloneNode( true );
	}

	function icon( name ) {
		return $( iconEl( name ) );
	}

	// Folder icons (stored keys, see FMM_Taxonomy::ICONS): glyphs drawn inside the folder.
	var FOLDER_ICONS = [ 'image', 'video', 'document', 'audio', 'archive', 'star', 'people', 'tag' ];
	var glyphCache = {};

	function iconLabels() {
		return {
			'': __( 'None (Default)', 'fena-media-manager' ),
			image: __( 'Image', 'fena-media-manager' ),
			video: __( 'Video', 'fena-media-manager' ),
			document: __( 'Document', 'fena-media-manager' ),
			audio: __( 'Audio', 'fena-media-manager' ),
			archive: __( 'Archive', 'fena-media-manager' ),
			star: __( 'Star', 'fena-media-manager' ),
			people: __( 'People', 'fena-media-manager' ),
			tag: __( 'Tag', 'fena-media-manager' )
		};
	}

	// Folder icon glyph: its own svg shown next to the folder icon (not inside it).
	function glyphEl( key ) {
		var node = glyphCache[ key ];
		var use;

		if ( ! node ) {
			node = glyphCache[ key ] = document.createElementNS( SVG_NS, 'svg' );
			use = document.createElementNS( SVG_NS, 'use' );
			node.setAttribute( 'class', 'fmm-icon fmm-folder__glyph' );
			node.setAttribute( 'aria-hidden', 'true' );
			node.setAttribute( 'focusable', 'false' );
			use.setAttribute( 'href', '#fmm-g-' + key );
			node.appendChild( use );
		}

		return node.cloneNode( true );
	}

	// Folder icon plus, when the folder has an icon, the glyph after it.
	function folderIconEls( key ) {
		var els = [ iconEl( 'folder' ) ];

		if ( _.contains( FOLDER_ICONS, key ) ) {
			els.push( glyphEl( key ) );
		}

		return els;
	}

	// Stand-alone glyph (icon tiles).
	function glyphIconEl( key ) {
		var svg = document.createElementNS( SVG_NS, 'svg' );
		var use = document.createElementNS( SVG_NS, 'use' );

		svg.setAttribute( 'class', 'fmm-icon' );
		svg.setAttribute( 'aria-hidden', 'true' );
		svg.setAttribute( 'focusable', 'false' );
		use.setAttribute( 'href', '#fmm-g-' + key );
		svg.appendChild( use );

		return svg;
	}

	function tag( name, className, type ) {
		var el = document.createElement( name );

		if ( className ) {
			el.className = className;
		}
		if ( type ) {
			el.setAttribute( 'type', type );
		}

		return el;
	}

	/*
	 * Row building blocks are cloned (cloneNode) instead of parsed from HTML
	 * strings; strings that do not depend on the row are translated once.
	 */
	var TPL = null;
	var STR = null;
	var actionTpl = {};
	var countLabels = {};

	function templates() {
		var folder;

		if ( ! TPL ) {
			folder = tag( 'button', 'fmm-folder', 'button' );
			folder.appendChild( tag( 'span', 'fmm-folder__name' ) );
			folder.appendChild( tag( 'span', 'fmm-folder__count' ) );
			TPL = {
				li: tag( 'li', 'fmm-sidebar__item' ),
				folder: folder,
				toggle: tag( 'button', 'fmm-folder-toggle', 'button' ),
				actions: tag( 'span', 'fmm-folder__actions' ),
				assign: tag( 'span', 'fmm-folder__assign' )
			};
		}

		return TPL;
	}

	function strings() {
		return STR || ( STR = {
			/* translators: %s: folder name. */
			subfolder: __( 'New subfolder in “%s”', 'fena-media-manager' ),
			/* translators: %s: folder name. */
			more: __( 'More actions for “%s”', 'fena-media-manager' ),
			/* translators: %s: folder name. */
			hide: __( 'Hide subfolders of “%s”', 'fena-media-manager' ),
			/* translators: %s: folder name. */
			show: __( 'Show subfolders of “%s”', 'fena-media-manager' )
		} );
	}

	function countLabel( count ) {
		/* translators: %d: number of media items. */
		return countLabels[ count ] || ( countLabels[ count ] = sprintf( _n( '%d item', '%d items', count, 'fena-media-manager' ), count ) );
	}

	// Assign button labels: the plural form depends on the selection size, so the format is chosen once per pass.
	function addLabel( ctx, name ) {
		/* translators: 1: number of media files, 2: folder name. */
		ctx.addFmt = ctx.addFmt || _n( 'Add %1$d selected media file to “%2$s”', 'Add %1$d selected media files to “%2$s”', ctx.selected, 'fena-media-manager' );
		return sprintf( ctx.addFmt, ctx.selected, name );
	}

	function moveLabel( ctx, name ) {
		/* translators: 1: number of media files, 2: source folder name, 3: target folder name. */
		ctx.moveFmt = ctx.moveFmt || _n( 'Move %1$d selected media file from “%2$s” to “%3$s”', 'Move %1$d selected media files from “%2$s” to “%3$s”', ctx.selected, 'fena-media-manager' );
		return sprintf( ctx.moveFmt, ctx.selected, ctx.sourceName, name );
	}

	function removeLabel( count, name ) {
		/* translators: 1: number of media files, 2: folder name. */
		return sprintf( _n( 'Remove %1$d selected media file from “%2$s”', 'Remove %1$d selected media files from “%2$s”', count, 'fena-media-manager' ), count, name );
	}

	/*
	 * Folder value of a sidebar row ('' = All Media, 'none', or an ID). Read
	 * with attr(): jQuery's data() would cache on the element and make
	 * emptying the list walk jQuery's data store for every row.
	 */
	function rowValue( el ) {
		return String( $( el ).closest( 'li' ).attr( 'data-folder' ) );
	}

	/**
	 * Local storage when available (Safari private mode and blocked storage throw).
	 *
	 * @return {Storage|null} Storage.
	 */
	function storage() {
		try {
			return window.localStorage;
		} catch ( e ) {
			return null;
		}
	}

	/**
	 * Lowercases a string and removes accents, remembering for every result
	 * character the index of the original character it came from.
	 *
	 * @param {string} value Text.
	 * @return {Object} { text, map } with map[ i ] = original index of text[ i ].
	 */
	var fold = window.fmmPicker.fold;


	/**
	 * Sidebar controller.
	 *
	 * @param {Object} frame Media grid frame.
	 */
	function Sidebar( frame ) {
		this.frame = frame;
		this.library = frame.state().get( 'library' );
		this.selection = frame.state().get( 'selection' );
		this.editing = null; // Folder ID being renamed, or 'new'.
		this.newParent = ''; // Parent folder ID of a new subfolder.
		this.expanded = {}; // Folder ID => true; all collapsed on load.
		this.hasTree = false;
		this.busy = false;
		this.dragIds = null;
		this.dragFolder = null; // Folder ID being dragged for reordering.
		this.renderPending = false;
		this.menuOpen = null; // Folder ID whose actions menu is open.
		this.query = ''; // Normalized folder search query; never persisted.
		this.matchCount = 0;
		this.announceTimer = null;
		this.foldCache = Object.create( null );
		this.activeRow = null; // Row element of the active folder.
		this.selectionFrame = 0;
		this.searchTimer = 0;
		this.mq = window.matchMedia ? window.matchMedia( LAZY_QUERY ) : null;
		this.pointerSeen = false; // Keyboard and screen reader users keep every row action in the DOM.
		this.lazy = this.lazyWanted();
		this.hoverId = null; // Folder row under the pointer (lazy actions).
		this.focusRowId = null; // Folder row containing the focus.
		this.prepId = null; // Row whose actions must exist for an imminent focus move.
		this.lastFolderId = null; // Last rendered folder row: always has its actions (entry point for Shift+Tab).

		if ( store.treeExpanded ) {
			_.each( store.tree(), function( node ) {
				if ( node.hasChildren ) {
					this.expanded[ String( node.folder.id ) ] = true;
				}
			}, this );
		}
		this.restoreFolder();

		this.$el = $( '<nav class="fmm fmm-sidebar"></nav>' ).attr( 'aria-label', __( 'Folders', 'fena-media-manager' ) );
		this.$el.append(
			$( '<div class="fmm-sidebar__header"></div>' ).append(
				$( '<h2 class="fmm-sidebar__title"></h2>' ).text( __( 'Folders', 'fena-media-manager' ) ),
				store.canManage ? $( '<button type="button" class="fmm-sidebar__new" data-fmm-key="new"></button>' )
					.append( icon( 'create' ), $( '<span></span>' ).text( __( 'New Folder', 'fena-media-manager' ) ) ) : null
			),
			$( '<div class="fmm-sidebar__toolbar"></div>' ).append( this.searchControl(), this.sortControl() ),
			$( '<div class="fmm-sidebar__notice fmm-notice-ui notice inline is-dismissible" hidden></div>' ).append(
				'<span class="fmm-notice-ui__icon" aria-hidden="true"></span>',
				'<p></p>',
				$( '<button type="button" class="notice-dismiss"></button>' ).append(
					icon( 'dismiss' ),
					$( '<span class="screen-reader-text"></span>' ).text( __( 'Dismiss this notice.', 'fena-media-manager' ) )
				)
			),
			'<p class="fmm-sidebar__selection" hidden></p>',
			'<ul class="fmm-sidebar__list"></ul>'
		);
		this.list = this.$el.find( '.fmm-sidebar__list' )[ 0 ];

		this.bind();
		this.bindDrag();
		this.render();
	}

	_.extend( Sidebar.prototype, {

		/**
		 * Restores the folder that was selected last (setting "Restore last
		 * folder") and remembers every later selection. Without the setting
		 * nothing is read or written.
		 */
		restoreFolder: function() {
			var self = this;
			var saved = store.restoreLast && store.storageKey ? storage() : null;
			var value;

			if ( ! saved ) {
				return;
			}

			try {
				value = saved.getItem( store.storageKey );
				if ( value && ( 'none' === value || ( /^\d+$/.test( value ) && store.get( value ) ) ) ) {
					this.library.props.set( PROP, value );
				} else if ( null !== value ) {
					saved.removeItem( store.storageKey );
				}
			} catch ( e ) {
				return;
			}

			this.library.props.on( 'change:' + PROP, function() {
				var current = self.current();

				try {
					if ( current ) {
						saved.setItem( store.storageKey, current );
					} else {
						saved.removeItem( store.storageKey );
					}
				} catch ( e ) {
					return;
				}
			} );
		},

		/**
		 * Folder search field (client-side filtering of the tree).
		 *
		 * @return {jQuery} Search control.
		 */
		searchControl: function() {
			return $( '<div class="fmm-search" role="search"></div>' ).append(
				$( '<label class="screen-reader-text" for="fmm-folder-search"></label>' ).text( __( 'Search folders', 'fena-media-manager' ) ),
				icon( 'search' ).addClass( 'fmm-search__icon' ),
				$( '<input type="search" id="fmm-folder-search" class="fmm-search__input" autocomplete="off" spellcheck="false" />' ).attr( 'placeholder', __( 'Search folders…', 'fena-media-manager' ) )
			);
		},

		/**
		 * Stores the search field value; the list renders 120 ms after the
		 * last input (at once when cleared), or earlier through flushSearch().
		 *
		 * @param {string}  raw     Field value.
		 * @param {boolean} cleared Whether the search was cleared with Escape.
		 */
		setQuery: function( raw, cleared ) {
			var self = this;

			this.query = fold( $.trim( raw ) ).text;
			clearTimeout( this.searchTimer );
			this.searchTimer = 0;
			if ( cleared ) {
				this.render();
				this.announceSearch( true );
				return;
			}
			this.searchTimer = setTimeout( function() {
				self.flushSearch();
			}, 120 );
		},

		/**
		 * Renders a pending search now (Enter, ArrowDown, drag start).
		 */
		flushSearch: function() {
			if ( ! this.searchTimer ) {
				return;
			}
			clearTimeout( this.searchTimer );
			this.searchTimer = 0;
			this.render();
			this.announceSearch( false );
		},

		/**
		 * Announces the number of matches (debounced).
		 *
		 * @param {boolean} cleared Whether the search was cleared with Escape.
		 */
		announceSearch: function( cleared ) {
			var self = this;

			clearTimeout( this.announceTimer );
			this.announceTimer = setTimeout( function() {
				// A newer query is waiting to render; it announces its own result.
				if ( ! wp.a11y || self.searchTimer ) {
					return;
				}
				if ( self.query ) {
					wp.a11y.speak( self.matchCount ?
						/* translators: %d: number of folders. */
						sprintf( _n( '%d folder found.', '%d folders found.', self.matchCount, 'fena-media-manager' ), self.matchCount ) :
						__( 'No folders found.', 'fena-media-manager' ), 'polite' );
				} else if ( cleared ) {
					wp.a11y.speak( __( 'Search cleared.', 'fena-media-manager' ), 'polite' );
				}
			}, 400 );
		},

		/**
		 * Cached fold() of a folder name (reset when the store changes).
		 *
		 * @param {string} name Folder name.
		 * @return {Object} See fold().
		 */
		folded: function( name ) {
			return this.foldCache[ name ] || ( this.foldCache[ name ] = fold( name ) );
		},

		/**
		 * Position of the search query in a folder name.
		 *
		 * @param {string} name Folder name.
		 * @return {Object|null} { start, end } in the original name, or null.
		 */
		findMatch: function( name ) {
			var folded, index;

			if ( ! this.query ) {
				return null;
			}

			folded = this.folded( name );
			index = folded.text.indexOf( this.query );

			return index < 0 ? null : { start: folded.map[ index ], end: folded.map[ index + this.query.length - 1 ] + 1 };
		},

		/**
		 * Fills the folder name element; the search match is wrapped in <mark> (text nodes only).
		 *
		 * @param {Element} el        Name element.
		 * @param {string}  name      Folder name.
		 * @param {boolean} highlight Whether to mark the search match.
		 */
		fillName: function( el, name, highlight ) {
			var match = highlight ? this.findMatch( name ) : null;
			var mark;

			if ( ! match ) {
				el.textContent = name;
				return;
			}

			mark = tag( 'mark', 'fmm-search__mark' );
			mark.textContent = name.slice( match.start, match.end );
			el.appendChild( document.createTextNode( name.slice( 0, match.start ) ) );
			el.appendChild( mark );
			el.appendChild( document.createTextNode( name.slice( match.end ) ) );
		},

		/**
		 * Sort mode menu button; the server sorts, this only stores the choice.
		 *
		 * @return {jQuery} Sort control.
		 */
		sortControl: function() {
			var $menu = $( '<div id="fmm-sort-menu" class="fmm-sort__menu" role="menu" aria-labelledby="fmm-folder-sort" hidden></div>' );

			this.sortModes = {
				name_asc: __( 'Name (A–Z)', 'fena-media-manager' ),
				name_desc: __( 'Name (Z–A)', 'fena-media-manager' ),
				newest: __( 'Newest first', 'fena-media-manager' ),
				oldest: __( 'Oldest first', 'fena-media-manager' ),
				manual: __( 'Manual order', 'fena-media-manager' )
			};

			_.each( this.sortModes, function( label, mode ) {
				$menu.append( $( '<button type="button" class="fmm-sort__item" role="menuitemradio" aria-checked="false" tabindex="-1"></button>' )
					.attr( 'data-sort', mode ).append( icon( 'check' ), $( '<span></span>' ).text( label ) ) );
			} );

			return $( '<div class="fmm-sort"></div>' ).append(
				$( '<button type="button" id="fmm-folder-sort" class="fmm-sort__button" aria-haspopup="menu" aria-expanded="false" aria-controls="fmm-sort-menu"></button>' ).append( icon( 'sort' ) ),
				$menu
			);
		},

		/**
		 * Button name and checked item follow the stored sort mode.
		 */
		syncSort: function() {
			/* translators: %s: current sort order, e.g. "Name (A–Z)". */
			var label = sprintf( __( 'Sort folders: %s', 'fena-media-manager' ), this.sortModes[ store.sort ] || '' );

			this.$el.find( '.fmm-sort__button' ).attr( { 'aria-label': label, title: label } );
			this.$el.find( '.fmm-sort__item' ).each( function() {
				this.setAttribute( 'aria-checked', String( this.getAttribute( 'data-sort' ) === store.sort ) );
			} );
		},

		/**
		 * Opens the sort menu.
		 *
		 * @param {boolean} [last] Focus the last item instead of the checked one.
		 */
		openSort: function( last ) {
			var $items;

			if ( this.menuOpen ) {
				this.closeMenu();
			}
			this.$el.find( '.fmm-sort__button' ).attr( 'aria-expanded', 'true' );
			this.$el.find( '.fmm-sort__menu' ).prop( 'hidden', false );
			$items = this.$el.find( '.fmm-sort__item' );
			( last ? $items.last() : $items.filter( '[aria-checked="true"]' ).first() ).trigger( 'focus' );
		},

		/**
		 * Closes the sort menu.
		 *
		 * @param {boolean} [refocus] Move focus back to the button.
		 */
		closeSort: function( refocus ) {
			this.$el.find( '.fmm-sort__button' ).attr( 'aria-expanded', 'false' );
			this.$el.find( '.fmm-sort__menu' ).prop( 'hidden', true );
			if ( refocus ) {
				this.$el.find( '.fmm-sort__button' ).trigger( 'focus' );
			}
		},

		isSortOpen: function() {
			return ! this.$el.find( '.fmm-sort__menu' ).prop( 'hidden' );
		},

		/**
		 * Stores a chosen sort mode.
		 *
		 * @param {string} mode Sort mode.
		 */
		chooseSort: function( mode ) {
			var self = this;
			var label = this.sortModes[ mode ];

			this.closeSort( true );
			if ( mode === store.sort || ! label ) {
				return;
			}
			store.setSort( mode ).then( function() {
				if ( wp.a11y ) {
					/* translators: %s: sort order, e.g. "Name (A–Z)". */
					wp.a11y.speak( sprintf( __( 'Folders sorted: %s.', 'fena-media-manager' ), label ), 'polite' );
				}
			} ).catch( function( error ) {
				self.fail( error, __( 'The sort order could not be saved.', 'fena-media-manager' ) );
				self.syncSort();
			} );
		},

		/**
		 * Tree node of a folder.
		 *
		 * @param {string} id Folder ID.
		 * @return {Object|undefined} Node from store.tree().
		 */
		node: function( id ) {
			return store.node( id );
		},

		/**
		 * Effective parent ID of a tree node ('0' = top level).
		 *
		 * @param {Object} node Node from store.tree().
		 * @return {string} Parent ID.
		 */
		parentOf: function( node ) {
			return node.parents.length ? node.parents[ node.parents.length - 1 ] : '0';
		},

		/**
		 * Sibling folder IDs of a folder (including itself) in server order.
		 *
		 * @param {string} id Folder ID.
		 * @return {Object|null} { parent, ids } or null for unknown folders.
		 */
		siblings: function( id ) {
			var self = this;
			var tree = store.tree();
			var node = this.node( id );

			if ( ! node ) {
				return null;
			}

			return {
				parent: this.parentOf( node ),
				ids: _.chain( tree ).filter( function( other ) {
					return self.parentOf( other ) === self.parentOf( node );
				} ).map( function( other ) {
					return String( other.folder.id );
				} ).value()
			};
		},

		current: function() {
			var value = this.library.props.get( PROP );
			return ( null === value || undefined === value || '' === value ) ? '' : String( value );
		},

		/**
		 * The active real folder (media can be moved out of it), or ''.
		 *
		 * @return {string} Folder ID or ''.
		 */
		currentFolder: function() {
			var current = this.current();
			return /^\d+$/.test( current ) && store.get( current ) ? current : '';
		},

		/**
		 * Drop action: inside a folder view dragging moves media out of the
		 * active folder; Ctrl/⌘ adds instead. Elsewhere dragging adds.
		 *
		 * @param {Event}  event    Drag event.
		 * @param {string} folderId Target folder ID.
		 * @return {string} 'move' or 'add'.
		 */
		dropMode: function( event, folderId ) {
			var source = this.currentFolder();
			return source && source !== String( folderId ) && ! event.ctrlKey && ! event.metaKey ? 'move' : 'add';
		},

		selectedIds: function() {
			return this.selection ? this.selection.pluck( 'id' ) : [];
		},

		/**
		 * How many selected items are in each folder.
		 *
		 * @return {Object} Folder ID => count.
		 */
		selectedCounts: function() {
			var counts = {};

			if ( this.selection ) {
				this.selection.each( function( model ) {
					var seen = {};

					_.each( model.get( 'fmmFolders' ) || [], function( id ) {
						var key = String( Number( id ) );

						if ( ! seen[ key ] ) {
							seen[ key ] = true;
							counts[ key ] = ( counts[ key ] || 0 ) + 1;
						}
					} );
				} );
			}

			return counts;
		},

		bind: function() {
			var self = this;
			var moveEvent, onMove;

			store.on( 'change', function() {
				this.foldCache = Object.create( null );
			}, this );
			store.on( 'change', this.render, this );
			this.library.props.on( 'change:' + PROP, this.folderChanged, this );
			if ( this.selection ) {
				this.selection.on( 'add remove reset change:fmmFolders', this.queueSelection, this );
			}

			this.$el.on( 'click', '.fmm-sidebar__new', function() {
				self.startEdit( 'new' );
			} );

			this.$el.on( 'click', '.fmm-folder', function() {
				var value = rowValue( this );
				self.library.props.set( PROP, '' === value ? null : value );
			} );

			// Separate button: expanding never selects the folder.
			this.$el.on( 'click', '.fmm-folder-toggle[aria-expanded]', function() {
				self.toggleFolder( rowValue( this ) );
			} );

			this.$el.on( 'click', '.fmm-folder-subfolder', function() {
				self.startEdit( 'new', rowValue( this ) );
			} );

			this.$el.on( 'input search', '.fmm-search__input', function() {
				self.setQuery( $( this ).val(), false );
			} );

			this.$el.on( 'keydown', '.fmm-search__input', function( event ) {
				var $first;

				if ( 'Escape' === event.key && $( this ).val() ) {
					event.preventDefault();
					event.stopPropagation();
					$( this ).val( '' );
					self.setQuery( '', true );
				} else if ( 'ArrowDown' === event.key ) {
					self.flushSearch();
					$first = self.$el.find( '.fmm-sidebar__item--folder .fmm-folder' ).first();
					if ( $first.length ) {
						event.preventDefault();
						$first.trigger( 'focus' );
					}
				} else if ( 'Enter' === event.key ) {
					event.preventDefault();
					self.flushSearch();
				}
			} );

			this.$el.on( 'click', '.fmm-sort__button', function() {
				if ( self.isSortOpen() ) {
					self.closeSort( false );
				} else {
					self.openSort( false );
				}
			} );

			this.$el.on( 'keydown', '.fmm-sort__button', function( event ) {
				if ( 'ArrowDown' === event.key || 'ArrowUp' === event.key ) {
					event.preventDefault();
					self.openSort( 'ArrowUp' === event.key );
				}
			} );

			this.$el.on( 'click', '.fmm-sort__item', function() {
				self.chooseSort( this.getAttribute( 'data-sort' ) );
			} );

			this.$el.on( 'keydown', '.fmm-sort__menu', function( event ) {
				var $items = $( this ).find( '.fmm-sort__item' );
				var index = $items.index( document.activeElement );

				if ( 'Escape' === event.key ) {
					event.preventDefault();
					event.stopPropagation();
					self.closeSort( true );
					return;
				}
				if ( 'Tab' === event.key ) {
					self.closeSort( false );
					return;
				}
				if ( 'Enter' === event.key || ' ' === event.key ) {
					event.preventDefault();
					if ( index >= 0 ) {
						self.chooseSort( $items.eq( index ).attr( 'data-sort' ) );
					}
					return;
				}
				if ( 'ArrowDown' === event.key ) {
					index = ( index + 1 ) % $items.length;
				} else if ( 'ArrowUp' === event.key ) {
					index = ( index + $items.length - 1 ) % $items.length;
				} else if ( 'Home' === event.key ) {
					index = 0;
				} else if ( 'End' === event.key ) {
					index = $items.length - 1;
				} else {
					return;
				}
				event.preventDefault();
				$items.eq( index ).trigger( 'focus' );
			} );

			$( document ).on( 'click', function( event ) {
				if ( self.isSortOpen() && ! $( event.target ).closest( '.fmm-sort' ).length ) {
					self.closeSort( false );
				}
			} );

			this.$el.on( 'click', '.fmm-folder-menu-toggle', function() {
				var id = rowValue( this );
				var menu;
				self.closeSort( false );
				self.menuOpen = self.menuOpen === id ? null : id;
				self.render();
				self.focusKey( 'menu-' + id );
				// The list scrolls inside the rail: keep a menu on the last rows in view.
				menu = self.menuOpen ? document.getElementById( 'fmm-folder-menu-' + id ) : null;
				if ( menu ) {
					menu.scrollIntoView( { block: 'nearest' } );
				}
			} );

			this.$el.on( 'click', '.fmm-folder-moveto', function() {
				var id = rowValue( this );
				self.menuOpen = null;
				self.render();
				self.openMoveDialog( id );
			} );

			this.$el.on( 'click', '.fmm-folder-color', function() {
				var id = rowValue( this );
				self.menuOpen = null;
				self.render();
				self.openAppearanceDialog( id );
			} );

			this.$el.on( 'click', '.fmm-folder-up, .fmm-folder-down', function() {
				self.move( rowValue( this ), $( this ).hasClass( 'fmm-folder-up' ) ? -1 : 1 );
			} );

			this.$el.on( 'keydown', '.fmm-sidebar__item', function( event ) {
				var id = rowValue( this );
				var $items, index;

				if ( self.menuOpen !== id || ! $( event.target ).closest( '.fmm-menu, .fmm-folder-menu-toggle' ).length ) {
					return;
				}

				if ( 'Escape' === event.key ) {
					event.preventDefault();
					event.stopPropagation();
					self.closeMenu( 'menu-' + id );
					return;
				}

				$items = $( this ).find( '.fmm-menu__item' );
				index = $items.index( event.target );
				if ( ! $items.length || ( index < 0 && 'ArrowDown' !== event.key ) ) {
					return;
				}
				if ( 'ArrowDown' === event.key ) {
					index = index < 0 ? 0 : ( index + 1 ) % $items.length;
				} else if ( 'ArrowUp' === event.key ) {
					index = ( index + $items.length - 1 ) % $items.length;
				} else if ( 'Home' === event.key ) {
					index = 0;
				} else if ( 'End' === event.key ) {
					index = $items.length - 1;
				} else {
					return;
				}
				event.preventDefault();
				$items.eq( index ).trigger( 'focus' );
			} );

			this.$el.on( 'focusout', '.fmm-sidebar__item', function() {
				var id = rowValue( this );

				setTimeout( function() {
					var active = document.activeElement;
					var $row = self.$el.find( '.fmm-sidebar__item[data-folder="' + id + '"]' );

					// Focus on <body> is a click on empty space, handled by the click listener.
					if ( self.menuOpen === id && active && active !== document.body && $row.length && ! $.contains( $row[ 0 ], active ) ) {
						self.closeMenu();
					}
				}, 0 );
			} );

			/*
			 * Lazy row actions: rows under the pointer or holding the focus get
			 * their buttons (and lose them again); see needsActions().
			 */
			this.$el.on( 'mouseover', function( event ) {
				var li = self.lazy ? event.target.closest( '.fmm-sidebar__item--folder' ) : null;
				self.setHover( li ? li.getAttribute( 'data-folder' ) : null );
			} );

			this.$el.on( 'mouseleave', function() {
				self.setHover( null );
			} );

			this.$el.on( 'focusin', function( event ) {
				self.setFocusRow( self.focusRowOf( event.target ) );
			} );

			this.$el.on( 'focusout', function() {
				setTimeout( function() {
					var active = document.activeElement;
					self.setFocusRow( active && self.$el[ 0 ].contains( active ) ? self.focusRowOf( active ) : null );
				}, 0 );
			} );

			// Shift+Tab out of a row lands on the previous row's menu button: create it before the browser moves focus.
			this.$el.on( 'keydown', '.fmm-sidebar__item--folder', function( event ) {
				var first = this.querySelector( '.fmm-folder-toggle:not(:disabled)' ) || this.querySelector( '.fmm-folder' );
				var prev = this.previousElementSibling;

				if ( 'Tab' !== event.key || ! event.shiftKey || ! self.lazy || event.target !== first || ! prev || ! prev.classList.contains( 'fmm-sidebar__item--folder' ) ) {
					return;
				}
				self.prepare( prev.getAttribute( 'data-folder' ) );
			} );

			if ( this.mq ) {
				this.mq[ this.mq.addEventListener ? 'addEventListener' : 'addListener' ]( 'change', function() {
					self.updateLazy( true );
				} );
			}

			// The first mouse or pen movement enables lazy actions; existing buttons stay until the next render.
			moveEvent = window.PointerEvent ? 'pointermove' : 'mousemove';
			onMove = function( event ) {
				if ( 'touch' === event.pointerType ) {
					return;
				}
				document.removeEventListener( moveEvent, onMove );
				self.pointerSeen = true;
				self.updateLazy( false );
			};
			document.addEventListener( moveEvent, onMove, { passive: true } );

			$( document ).on( 'click', function( event ) {
				if ( self.menuOpen && ! $( event.target ).closest( '.fmm-menu, .fmm-folder-menu-toggle' ).length ) {
					self.closeMenu();
				}
			} );

			this.$el.on( 'click', '.fmm-folder-rename', function() {
				self.startEdit( rowValue( this ) );
			} );

			this.$el.on( 'click', '.fmm-folder-lock, .fmm-folder-unlock', function() {
				self.setLocked( rowValue( this ), $( this ).hasClass( 'fmm-folder-lock' ) );
			} );

			this.$el.on( 'click', '.fmm-folder-delete', function() {
				self.remove( rowValue( this ) );
			} );

			this.$el.on( 'click', '.fmm-folder-add, .fmm-folder-remove, .fmm-folder-move', function() {
				var $button = $( this );
				var mode = $button.hasClass( 'fmm-folder-move' ) ? 'move' : 'add';
				self.assign( self.selectedIds(), rowValue( this ), $button.hasClass( 'fmm-folder-remove' ) ? 'remove' : mode );
			} );

			this.$el.on( 'click', '.notice-dismiss', function() {
				self.notice( '' );
			} );

			this.$el.on( 'submit', '.fmm-form', function( event ) {
				event.preventDefault();
				self.save( $( this ).find( 'input' ).val() );
			} );

			this.$el.on( 'click', '.fmm-form-cancel', function() {
				self.stopEdit();
			} );

			this.$el.on( 'keydown', '.fmm-form input', function( event ) {
				if ( 'Escape' === event.key ) {
					event.preventDefault();
					event.stopPropagation();
					self.stopEdit();
				}
			} );
		},

		/**
		 * Native drag-and-drop from the grid onto folders. Only drags that
		 * start on a grid item are handled; file drags from the desktop never
		 * set `dragIds` and reach the core uploader unchanged.
		 */
		bindDrag: function() {
			var self = this;
			var grid = this.frame.$el;

			// Make the whole tile draggable, not only its thumbnail image.
			grid.on( 'mousedown', '.attachments .attachment', function() {
				this.setAttribute( 'draggable', 'true' );
			} );

			grid.on( 'dragstart', '.attachments .attachment', function( event ) {
				var dt = event.originalEvent && event.originalEvent.dataTransfer;
				var id = parseInt( $( this ).data( 'id' ), 10 );
				var ids = self.selection && self.selection.get( id ) ? self.selectedIds() : [ id ];

				if ( ! dt || ! id ) {
					return;
				}

				self.flushSearch();
				self.dragIds = ids;
				dt.effectAllowed = 'copyMove';
				dt.setData( DRAG_TYPE, JSON.stringify( ids ) );
				if ( ids.length > 1 ) {
					self.dragGhost( dt, ids.length );
				}
				self.$el.addClass( 'is-dragging' );
			} );

			/*
			 * Capture phase: while one of our own drags is active, stop the
			 * events before they reach the core upload dropzone on <body>,
			 * which would otherwise show its "Drop files to upload" overlay.
			 */
			function over( event ) {
				var row;
				if ( self.dragFolder ) {
					self.folderOver( event );
					return;
				}
				if ( ! self.dragIds ) {
					return;
				}
				event.stopPropagation();
				row = $( event.target ).closest( '.fmm-sidebar__item--droppable' );
				if ( row.length ) {
					event.preventDefault();
					event.dataTransfer.dropEffect = 'move' === self.dropMode( event, rowValue( row ) ) ? 'move' : 'copy';
				}
				self.highlight( row );
			}

			function drop( event ) {
				var row;
				var ids = self.dragIds;
				if ( self.dragFolder ) {
					self.folderDrop( event );
					return;
				}
				if ( ! ids ) {
					return;
				}
				event.stopPropagation();
				event.preventDefault();
				row = $( event.target ).closest( '.fmm-sidebar__item--droppable' );
				self.endDrag();
				if ( row.length ) {
					self.assign( ids, rowValue( row ), self.dropMode( event, rowValue( row ) ) );
				}
			}

			this.$el.on( 'dragstart', '.fmm-folder[draggable="true"]', function( event ) {
				var dt = event.originalEvent && event.originalEvent.dataTransfer;
				var id = rowValue( this );

				if ( ! dt ) {
					return;
				}

				self.flushSearch();
				self.dragFolder = id;
				dt.effectAllowed = 'move';
				dt.setData( FOLDER_DRAG_TYPE, id );
				self.$el.addClass( 'is-dragging-folder' );
			} );

			document.addEventListener( 'dragenter', over, true );
			document.addEventListener( 'dragover', over, true );
			document.addEventListener( 'drop', drop, true );
			document.addEventListener( 'dragend', function() {
				self.endDrag();
			}, true );
		},

		dragGhost: function( dt, count ) {
			var ghost;
			if ( ! dt.setDragImage ) {
				return;
			}
			/* translators: %d: number of media files. */
			ghost = $( '<div class="fmm fmm-drag-ghost"></div>' ).text( sprintf( _n( '%d media file', '%d media files', count, 'fena-media-manager' ), count ) ).appendTo( document.body );
			dt.setDragImage( ghost[ 0 ], 12, 12 );
			setTimeout( function() {
				ghost.remove();
			}, 0 );
		},

		highlight: function( $row ) {
			this.$el.find( '.is-drop-target' ).not( $row ).removeClass( 'is-drop-target' );
			if ( $row && $row.length ) {
				$row.addClass( 'is-drop-target' );
			}
		},

		endDrag: function() {
			this.dragIds = null;
			this.dragFolder = null;
			this.highlight( null );
			this.clearFolderDrop();
			this.$el.removeClass( 'is-dragging is-dragging-folder' );
			if ( this.renderPending ) {
				this.render();
			}
		},

		clearFolderDrop: function() {
			this.$el.find( '.is-drop-before, .is-drop-after, .is-drop-into' ).removeClass( 'is-drop-before is-drop-after is-drop-into' );
		},

		/**
		 * Where a dragged folder would be dropped: next to a sibling row
		 * (manual order only, top and bottom quarter) or into a folder.
		 *
		 * @param {Event} event Drag event.
		 * @return {Object|null} { $row, id, position: 'before'|'after'|'into' } or null.
		 */
		// Whether the folders below a parent ('0' = top level) cannot be reordered: the parent is protected or a sibling is locked.
		levelLocked: function( parentId ) {
			var parent = '0' === parentId ? null : this.node( parentId );

			return !! ( parent && parent.protected ) || _.some( store.tree(), function( node ) {
				return node.folder.locked && ( node.parents.length ? node.parents[ node.parents.length - 1 ] : '0' ) === parentId;
			} );
		},

		folderDropTarget: function( event ) {
			var $row = $( event.target ).closest( '.fmm-sidebar__item--folder' );
			var dragged = this.node( this.dragFolder );
			var target, rect, ratio, position;

			if ( ! $row.length || ! $.contains( this.$el[ 0 ], $row[ 0 ] ) || ! dragged ) {
				return null;
			}

			target = this.node( rowValue( $row ) );
			if ( ! target || String( target.folder.id ) === this.dragFolder ) {
				return null;
			}

			rect = $row[ 0 ].getBoundingClientRect();
			ratio = ( event.clientY - rect.top ) / rect.height;

			if ( 'manual' === store.sort && this.parentOf( target ) === this.parentOf( dragged ) && ( ratio < 0.25 || ratio > 0.75 ) ) {
				if ( this.levelLocked( this.parentOf( target ) ) ) {
					return null;
				}
				position = ratio < 0.25 ? 'before' : 'after';
			} else if ( ! target.protected && ! _.contains( target.parents, this.dragFolder ) && String( target.folder.id ) !== this.parentOf( dragged ) ) {
				position = 'into';
			} else {
				return null;
			}

			return { $row: $row, id: String( target.folder.id ), position: position };
		},

		folderOver: function( event ) {
			var target = this.folderDropTarget( event );

			event.stopPropagation();
			this.clearFolderDrop();
			if ( target ) {
				event.preventDefault();
				event.dataTransfer.dropEffect = 'move';
				target.$row.addClass( 'is-drop-' + target.position );
			}
		},

		folderDrop: function( event ) {
			var target = this.folderDropTarget( event );
			var dragged = this.dragFolder;
			var info = this.siblings( dragged );
			var ids;

			event.stopPropagation();
			event.preventDefault();
			this.endDrag();

			if ( ! target || ! info ) {
				return;
			}

			if ( 'into' === target.position ) {
				this.dropIntoFolder( dragged, target.id );
				return;
			}

			ids = _.without( info.ids, dragged );
			ids.splice( _.indexOf( ids, target.id ) + ( 'after' === target.position ? 1 : 0 ), 0, dragged );
			if ( ! _.isEqual( ids, info.ids ) ) {
				this.saveOrder( dragged, info.parent, ids );
			}
		},

		/**
		 * Moves a dragged folder into another folder.
		 *
		 * @param {string} id     Dragged folder ID.
		 * @param {string} target Destination folder ID.
		 */
		dropIntoFolder: function( id, target ) {
			var self = this;
			var folder = store.get( id );
			var destination = store.get( target );

			if ( this.busy || ! folder || ! destination ) {
				return;
			}

			this.moveFolder( id, target ).catch( function( error ) {
				if ( error && 'fmm_folder_exists' === error.code ) {
					/* translators: 1: folder name, 2: destination folder name. */
					self.notice( sprintf( __( 'A folder named “%1$s” already exists in “%2$s”. Use “Move to…” to move and rename it.', 'fena-media-manager' ), folder.name, destination.name ), 'error' );
					return;
				}
				self.fail( error, __( 'The folder could not be moved.', 'fena-media-manager' ) );
			} );
		},

		/**
		 * Moves a folder below another folder (or to the top level) and
		 * optionally renames it. The folder keeps its media and subfolders.
		 *
		 * @param {string} id       Folder ID.
		 * @param {string} target   Destination folder ID, '0' for the top level.
		 * @param {string} [name]   New name.
		 * @return {Promise} Rejects with the REST error.
		 */
		moveFolder: function( id, target, name ) {
			var self = this;
			var data = { parent: Number( target ) || 0 };

			if ( name ) {
				data.name = name;
			}

			this.busy = true;
			return wp.apiFetch( { path: '/fmm/v1/folders/' + id, method: 'PATCH', data: data } ).then( function( folder ) {
				var destination = store.get( target );

				self.busy = false;
				self.expandTo( target );
				self.notice( destination ?
					/* translators: 1: folder name, 2: destination folder name. */
					sprintf( __( 'Folder “%1$s” moved to “%2$s”.', 'fena-media-manager' ), folder.name, destination.name ) :
					/* translators: %s: folder name. */
					sprintf( __( 'Folder “%s” moved to the top level.', 'fena-media-manager' ), folder.name ), 'success' );

				return store.refresh().then( function() {
					self.focusKey( 'folder-' + id );
				} );
			}, function( error ) {
				self.busy = false;
				throw error;
			} );
		},

		/**
		 * Expands a folder and its ancestors so a moved folder is visible.
		 *
		 * @param {string} id Folder ID ('0' does nothing).
		 */
		expandTo: function( id ) {
			var node = this.node( id );

			if ( node ) {
				this.expanded[ String( id ) ] = true;
				_.each( node.parents, function( parent ) {
					this.expanded[ parent ] = true;
				}, this );
			}
		},

		/**
		 * Shows a modal dialog; removed again when closed.
		 *
		 * @param {Object}   options
		 * @param {string}   options.title            Title.
		 * @param {jQuery}   options.body             Body content.
		 * @param {string}   options.submit           Primary button label.
		 * @param {Function} options.onSubmit         Called with the dialog API on submit.
		 * @param {string}   [options.focus]          data-fmm-key to focus after closing.
		 * @param {string}   [options.icon]           ICONS key shown in a round badge before the title.
		 * @param {boolean}  [options.describe]       Whether the body describes the dialog (aria-describedby).
		 * @param {string}   [options.initialFocus]   'cancel' to focus Cancel when opened.
		 * @param {string}   [options.className]      Extra class for the <dialog>.
		 * @return {Object} API: { close(), error( message ), busy( flag ) }.
		 */
		dialog: function( options ) {
			var self = this;
			var titleId = 'fmm-dialog-title';
			var bodyId = 'fmm-dialog-body';
			var $dialog = $( '<dialog class="fmm fmm-dialog"></dialog>' ).addClass( options.className ).attr( 'aria-labelledby', titleId );
			var $error = $( '<p class="fmm-dialog__error" role="alert" hidden></p>' );
			var $submit = $( '<button type="submit" class="fmm-dialog__submit"></button>' ).text( options.submit );
			var $cancel = $( '<button type="button" class="fmm-dialog__cancel"></button>' ).text( __( 'Cancel', 'fena-media-manager' ) );
			var $title = $( '<h2 class="fmm-dialog__title"></h2>' ).attr( 'id', titleId ).text( options.title );
			var api = {
				$error: $error,
				close: function() {
					$dialog[ 0 ].close();
				},
				error: function( message ) {
					$error.text( message ).prop( 'hidden', ! message );
				},
				busy: function( flag ) {
					$submit.prop( 'disabled', flag );
				}
			};

			$cancel.on( 'click', api.close );
			if ( options.describe ) {
				$dialog.attr( 'aria-describedby', bodyId );
			}

			$dialog.append(
				$( '<form method="dialog" class="fmm-dialog__form"></form>' ).append(
					options.icon ?
						$( '<div class="fmm-dialog__header"></div>' ).append(
							$( '<span class="fmm-dialog__badge" aria-hidden="true"></span>' ).addClass( 'fmm-dialog__badge--' + options.icon ).append( icon( options.icon ) ),
							$title
						) : $title,
					$( '<div class="fmm-dialog__body"></div>' ).attr( 'id', options.describe ? bodyId : null ).append( options.body ),
					$error,
					$( '<div class="fmm-dialog__footer"></div>' ).append( $cancel, $submit )
				).on( 'submit', function( event ) {
					event.preventDefault();
					options.onSubmit( api );
				} )
			);

			$dialog.on( 'close', function() {
				$dialog.remove();
				self.focusKey( options.focus );
			} );

			$dialog.appendTo( document.body )[ 0 ].showModal();
			if ( 'cancel' === options.initialFocus ) {
				$cancel.trigger( 'focus' );
			}

			return api;
		},

		/**
		 * "Appearance…" dialog of a folder: a preview card, the color (preset swatches or custom) and the icon.
		 *
		 * @param {string} id Folder ID.
		 */
		openAppearanceDialog: function( id ) {
			var self = this;
			var folder = store.get( id );
			var current = folder ? folder.color || '' : '';
			var custom = COLOR_HEX.test( current );
			var options = [
				{ value: 'gray', label: __( 'Gray (Default)', 'fena-media-manager' ) },
				{ value: 'blue', label: __( 'Blue', 'fena-media-manager' ) },
				{ value: 'violet', label: __( 'Violet', 'fena-media-manager' ) },
				{ value: 'sand', label: __( 'Sand', 'fena-media-manager' ) },
				{ value: 'green', label: __( 'Green', 'fena-media-manager' ) },
				{ value: 'custom', label: __( 'Custom', 'fena-media-manager' ) }
			];
			var selected = custom ? 'custom' : ( current || 'gray' );
			var startHex = custom ? current : DEFAULT_CUSTOM_COLOR;
			var currentIcon = folder && _.contains( FOLDER_ICONS, folder.icon ) ? folder.icon : '';
			var iconNames = iconLabels();
			var $picker, $hex, $customRow, $customSwatch, $preview, $caption, $fieldset, $iconSet, $previewIcon, $body;

			if ( ! folder ) {
				return;
			}

			$picker = $( '<input type="color" id="fmm-color-custom" />' ).val( startHex );
			$hex = $( '<input type="text" id="fmm-color-hex" maxlength="7" spellcheck="false" autocomplete="off" />' ).attr( 'placeholder', DEFAULT_CUSTOM_COLOR ).val( startHex );
			$caption = $( '<span class="fmm-appearance__caption"></span>' );
			$previewIcon = $( iconEl( 'folder' ) ).addClass( 'fmm-appearance__icon' );
			$preview = $( '<div class="fmm-appearance__preview"></div>' ).append(
				$previewIcon,
				$( '<span class="fmm-appearance__name"></span>' ).text( folder.name ),
				$caption
			);
			$fieldset = $( '<fieldset class="fmm-appearance__section"></fieldset>' ).append( $( '<legend></legend>' ).text( __( 'Color', 'fena-media-manager' ) ) );

			function hexFrom( raw ) {
				var value = $.trim( raw ).toLowerCase();
				value = '#' === value.charAt( 0 ) ? value : '#' + value;
				return COLOR_HEX.test( value ) ? value : '';
			}

			// Black or white check mark, whichever contrasts more with the color.
			function checkColor( hex ) {
				var c = [ 1, 3, 5 ].map( function( k ) {
					var v = parseInt( hex.slice( k, k + 2 ), 16 ) / 255;
					return v <= 0.03928 ? v / 12.92 : Math.pow( ( v + 0.055 ) / 1.055, 2.4 );
				} );
				return 0.2126 * c[ 0 ] + 0.7152 * c[ 1 ] + 0.0722 * c[ 2 ] > 0.5 ? 'var(--fmm-text)' : 'var(--fmm-on-primary)';
			}

			function choice() {
				return $fieldset.find( 'input[name="fmm-color"]:checked' ).val();
			}

			function iconChoice() {
				return $iconSet.find( 'input[name="fmm-icon"]:checked' ).val();
			}

			function showCustom( hex ) {
				$customSwatch[ 0 ].style.setProperty( '--fmm-folder-color', hex );
				$customSwatch[ 0 ].style.setProperty( '--fmm-check', checkColor( hex ) );
			}

			function refresh() {
				var value = choice();
				var hex = hexFrom( $hex.val() ) || String( $picker.val() ).toLowerCase();
				var glyph = iconChoice();
				var caption;

				$customRow.prop( 'hidden', 'custom' !== value );
				$preview.attr( 'data-fmm-color', 'custom' === value ? null : value );
				if ( 'custom' === value ) {
					$preview[ 0 ].style.setProperty( '--fmm-folder-color', hex );
					/* translators: %s: color as a hex value, e.g. #7b61c9. */
					caption = sprintf( __( 'Custom · %s', 'fena-media-manager' ), hex );
				} else {
					$preview[ 0 ].style.removeProperty( '--fmm-folder-color' );
					caption = _.findWhere( options, { value: value } ).label;
				}
				$caption.text( glyph ? caption + ' · ' + iconNames[ glyph ] : caption );
				$preview.find( '.fmm-folder__glyph' ).remove();
				if ( glyph ) {
					$previewIcon.after( $( glyphEl( glyph ) ).addClass( 'fmm-appearance__glyph' ) );
				}
			}

			_.each( options, function( option ) {
				var $swatch = $( '<span class="fmm-swatch" aria-hidden="true"></span>' ).attr( 'data-fmm-color', 'custom' === option.value ? null : option.value ).append( iconEl( 'check' ) );
				var $label = $( '<label class="fmm-swatch-option"></label>' ).attr( 'title', option.label ).append(
					$( '<input type="radio" name="fmm-color" />' ).val( option.value ).prop( 'checked', option.value === selected ),
					$swatch,
					$( '<span class="screen-reader-text"></span>' ).text( option.label )
				);

				if ( 'custom' === option.value ) {
					$customSwatch = $swatch;
					$label.addClass( 'fmm-swatch-option--custom' );
					showCustom( startHex );
				}
				$fieldset.append( $label );
			} );

			$iconSet = $( '<fieldset class="fmm-appearance__section fmm-appearance__icons"></fieldset>' ).append( $( '<legend></legend>' ).text( __( 'Icon', 'fena-media-manager' ) ) );
			_.each( [ '' ].concat( FOLDER_ICONS ), function( key ) {
				$iconSet.append( $( '<label class="fmm-icon-option"></label>' ).attr( 'title', iconNames[ key ] ).append(
					$( '<input type="radio" name="fmm-icon" />' ).val( key ).prop( 'checked', key === currentIcon ),
					$( '<span class="fmm-icon-tile" aria-hidden="true"></span>' ).append( key ? glyphIconEl( key ) : iconEl( 'folder' ) ),
					$( '<span class="screen-reader-text"></span>' ).text( iconNames[ key ] )
				) );
			} );
			$iconSet.on( 'change', 'input[name="fmm-icon"]', refresh );

			$customRow = $( '<div class="fmm-appearance__custom"></div>' ).prop( 'hidden', 'custom' !== selected ).append(
				$( '<label class="screen-reader-text" for="fmm-color-custom"></label>' ).text( __( 'Custom color', 'fena-media-manager' ) ),
				$picker,
				$( '<div class="fmm-dialog__field fmm-appearance__hex"></div>' ).append(
					$( '<label for="fmm-color-hex"></label>' ).text( __( 'Hex', 'fena-media-manager' ) ),
					$hex
				)
			);

			$fieldset.on( 'change', 'input[name="fmm-color"]', refresh );
			$picker.on( 'input change', function() {
				var hex = String( $picker.val() ).toLowerCase();

				$hex.val( hex );
				$fieldset.find( 'input[value="custom"]' ).prop( 'checked', true );
				showCustom( hex );
				refresh();
			} );
			$hex.on( 'input', function() {
				var hex = hexFrom( $hex.val() );

				$fieldset.find( 'input[value="custom"]' ).prop( 'checked', true );
				if ( hex ) {
					$picker.val( hex );
					showCustom( hex );
				}
				refresh();
			} );

			$body = $( '<div class="fmm-appearance"></div>' ).append( $preview, $fieldset, $customRow, $iconSet );
			refresh();

			this.dialog( {
				/* translators: %s: folder name. */
				title: sprintf( __( 'Appearance of folder “%s”', 'fena-media-manager' ), folder.name ),
				submit: __( 'Save', 'fena-media-manager' ),
				focus: 'folder-' + id,
				body: $body,
				onSubmit: function( api ) {
					var picked = choice();
					var hex = 'custom' === picked ? hexFrom( $hex.val() ) : '';
					var value = 'custom' === picked ? hex : picked;
					var glyph = iconChoice();
					var data = {};

					if ( 'custom' === picked && ! hex ) {
						api.error( __( 'Enter a color as a hex value, e.g. #7b61c9.', 'fena-media-manager' ) );
						$hex.trigger( 'focus' );
						return;
					}
					if ( value !== ( current || 'gray' ) ) {
						data.color = value;
					}
					if ( glyph !== currentIcon ) {
						data.icon = glyph;
					}
					if ( _.isEmpty( data ) ) {
						api.close();
						return;
					}
					if ( self.busy ) {
						return;
					}

					self.busy = true;
					api.error( '' );
					api.busy( true );
					wp.apiFetch( { path: '/fmm/v1/folders/' + id, method: 'PATCH', data: data } ).then( function() {
						self.busy = false;
						self.notice( _.has( data, 'icon' ) ?
							/* translators: %s: folder name. */
							sprintf( __( 'Appearance of folder “%s” changed.', 'fena-media-manager' ), folder.name ) :
							/* translators: %s: folder name. */
							sprintf( __( 'Color of folder “%s” changed.', 'fena-media-manager' ), folder.name ), 'success' );
						api.close();
						return store.refresh().then( function() {
							self.focusKey( 'folder-' + id );
						} );
					}, function( error ) {
						self.busy = false;
						api.busy( false );
						api.error( ( error && error.message ) || __( 'The appearance could not be saved.', 'fena-media-manager' ) );
					} );
				}
			} );
			$fieldset.find( 'input[name="fmm-color"]:checked' ).trigger( 'focus' );
		},

		/**
		 * Folder dropdown of the move dialog (see fmm-picker.js).
		 *
		 * @param {Object} config See fmmPicker.create(); options { value, label, depth, color, icon, path }.
		 * @return {Object} { $el, value(), focus() }.
		 */
		folderPicker: function( config ) {
			return window.fmmPicker.create( _.extend( {}, config, {
				options: _.map( config.options, function( option ) {
					return _.extend( { plain: '0' === option.value }, option );
				} )
			} ) );
		},

		/**
		 * "Move to…" dialog of a folder.
		 *
		 * @param {string} id Folder ID.
		 */
		openMoveDialog: function( id ) {
			var self = this;
			var folder = store.get( id );
			var node = this.node( id );
			var current, picker, $name, $nameField, pickerOptions;

			if ( ! folder || ! node ) {
				return;
			}

			current = this.parentOf( node );
			pickerOptions = [ { value: '0', label: __( 'Top level', 'fena-media-manager' ), depth: 0, color: '', path: '' } ];
			_.each( store.tree(), function( other ) {
				if ( String( other.folder.id ) !== id && ! _.contains( other.parents, id ) && ! other.protected ) {
					pickerOptions.push( {
						value: String( other.folder.id ),
						label: other.folder.name,
						depth: other.depth + 1,
						color: other.folder.color || '',
						icon: other.folder.icon || '',
						path: _.map( other.parents, function( parent ) {
							return ( store.get( parent ) || {} ).name;
						} ).join( ' › ' )
					} );
				}
			} );
			picker = this.folderPicker( {
				id: 'fmm-move-target',
				labelId: 'fmm-move-target-label',
				listId: 'fmm-move-listbox',
				options: pickerOptions,
				value: _.some( pickerOptions, { value: current } ) ? current : '0'
			} );

			$name = $( '<input type="text" id="fmm-move-name" maxlength="200" />' ).val( folder.name );
			$nameField = $( '<div class="fmm-dialog__field" hidden></div>' ).append(
				$( '<label for="fmm-move-name"></label>' ).text( __( 'New name', 'fena-media-manager' ) ),
				$name
			);

			this.dialog( {
				/* translators: %s: folder name. */
				title: sprintf( __( 'Move folder “%s”', 'fena-media-manager' ), folder.name ),
				submit: __( 'Move', 'fena-media-manager' ),
				className: 'fmm-dialog--move',
				focus: 'folder-' + id,
				body: [
					$( '<div class="fmm-dialog__field"></div>' ).append(
						$( '<label id="fmm-move-target-label"></label>' ).text( __( 'Destination', 'fena-media-manager' ) ).on( 'click', picker.focus ),
						picker.$el
					),
					$nameField
				],
				onSubmit: function( api ) {
					var target = picker.value();
					var renaming = ! $nameField.prop( 'hidden' );
					var name = renaming ? $.trim( $name.val() ) : '';
					var destination = store.get( target );

					if ( target === current && ! renaming ) {
						api.close();
						return;
					}
					if ( self.busy ) {
						return;
					}

					api.error( '' );
					api.busy( true );
					self.moveFolder( id, target, name ).then( function() {
						api.close();
					}, function( error ) {
						api.busy( false );
						if ( error && 'fmm_folder_exists' === error.code ) {
							$nameField.prop( 'hidden', false );
							api.error( destination ?
								/* translators: 1: folder name, 2: destination folder name. */
								sprintf( __( 'A folder named “%1$s” already exists in “%2$s”. Enter a different name to move it.', 'fena-media-manager' ), name || folder.name, destination.name ) :
								/* translators: %s: folder name. */
								sprintf( __( 'A folder named “%s” already exists at the top level. Enter a different name to move it.', 'fena-media-manager' ), name || folder.name ) );
							$name.trigger( 'focus' ).trigger( 'select' );
							return;
						}
						api.error( ( error && error.message ) || __( 'The folder could not be moved.', 'fena-media-manager' ) );
					} );
				}
			} );
		},

		/**
		 * Moves a folder one position among its siblings.
		 *
		 * @param {string} id    Folder ID.
		 * @param {number} delta -1 (up) or 1 (down).
		 */
		move: function( id, delta ) {
			var info = this.siblings( id );
			var index = info ? _.indexOf( info.ids, id ) : -1;
			var ids;

			if ( index < 0 || index + delta < 0 || index + delta >= info.ids.length ) {
				return;
			}

			ids = info.ids.slice();
			ids[ index ] = ids[ index + delta ];
			ids[ index + delta ] = id;

			this.saveOrder( id, info.parent, ids, delta < 0 ? 'up' : 'down' );
		},

		/**
		 * Saves the manual order of one sibling group.
		 *
		 * @param {string}   id       Moved folder ID.
		 * @param {string}   parent   Parent folder ID ('0' = top level).
		 * @param {string[]} ids      Sibling IDs in the new order.
		 * @param {string}   [action] 'up' or 'down' when started from the menu: refocuses that item.
		 */
		saveOrder: function( id, parent, ids, action ) {
			var self = this;
			var folder = store.get( id );

			if ( this.busy || ! folder ) {
				return;
			}

			this.busy = true;
			store.reorder( parent, ids ).then( function() {
				var $focus;

				self.busy = false;
				/* translators: 1: folder name, 2: new position, 3: number of folders on this level. */
				wp.a11y.speak( sprintf( __( 'Folder “%1$s” moved to position %2$d of %3$d.', 'fena-media-manager' ), folder.name, _.indexOf( ids, id ) + 1, ids.length ), 'polite' );

				if ( action && self.menuOpen === id ) {
					$focus = _.find( _.map( [ action + '-' + id, ( 'up' === action ? 'down-' : 'up-' ) + id, 'menu-' + id ], function( key ) {
						return self.$el.find( '[data-fmm-key="' + key + '"]' );
					} ), function( $candidate ) {
						return $candidate.length;
					} );
					if ( $focus ) {
						$focus.trigger( 'focus' );
					}
				}
			} ).catch( function( error ) {
				if ( error && 'fmm_order_conflict' === error.code ) {
					self.busy = false;
					self.notice( error.message, 'warning' );
					store.refresh().catch( function() {} );
					return;
				}
				self.fail( error, __( 'The folder order could not be saved.', 'fena-media-manager' ) );
			} );
		},

		/**
		 * Closes the actions menu.
		 *
		 * @param {string} [focus] data-fmm-key to focus afterwards.
		 */
		closeMenu: function( focus ) {
			this.menuOpen = null;
			this.render();
			if ( focus ) {
				this.focusKey( focus );
			}
		},

		/**
		 * Per-render state shared by all rows.
		 *
		 * @return {Object} { current, selected, source, sourceName, counts }.
		 */
		context: function() {
			var selected = this.selection ? this.selection.length : 0;
			var source = this.currentFolder();

			return {
				current: this.current(),
				selected: selected,
				source: source,
				sourceName: source ? store.get( source ).name : '',
				counts: selected ? this.selectedCounts() : null
			};
		},

		/**
		 * One list row.
		 *
		 * @param {string}  value    Filter value ('' = all, 'none', or ID).
		 * @param {string}  name     Label.
		 * @param {number}  count    Media count.
		 * @param {string}  iconName Icon name.
		 * @param {boolean} isFolder Whether this is a real folder.
		 * @param {Object}  ctx      See context().
		 * @param {Object}  [node]   Tree node from store.tree().
		 * @return {Element} Row.
		 */
		row: function( value, name, count, iconName, isFolder, ctx, node ) {
			var li = templates().li.cloneNode( false );
			var active = value === ctx.current;
			var folder, countEl, glyph, lock;

			li.setAttribute( 'data-folder', value );
			if ( active ) {
				li.classList.add( 'is-active' );
			}

			if ( node && node.depth ) {
				li.style.setProperty( '--fmm-depth', node.depth );
			}

			if ( isFolder && String( this.editing ) === value ) {
				li.appendChild( this.form( name )[ 0 ] );
				return li;
			}

			// Chevron column (only while any folder has subfolders); leaves are padded to match in CSS.
			if ( this.hasTree ) {
				if ( node && node.hasChildren ) {
					li.appendChild( this.toggleButton( node.folder ) );
				} else {
					li.classList.add( 'fmm-sidebar__item--leaf' );
				}
			}

			folder = templates().folder.cloneNode( true );
			glyph = isFolder && 'folder' === iconName && node && _.contains( FOLDER_ICONS, node.folder.icon ) ? node.folder.icon : '';
			folder.insertBefore( iconEl( iconName ), folder.firstChild );
			if ( glyph ) {
				folder.insertBefore( glyphEl( glyph ), folder.firstChild.nextSibling );
			}
			if ( active && isFolder && 'folder' === iconName ) {
				folder.firstChild.firstChild.setAttribute( 'href', '#fmm-i-folder-open' );
			}
			folder.setAttribute( 'data-fmm-key', 'folder-' + value );
			this.fillName( folder.childNodes[ glyph ? 2 : 1 ], name, isFolder );
			if ( node && node.folder.locked ) {
				lock = iconEl( 'lock' );
				lock.setAttribute( 'class', lock.getAttribute( 'class' ) + ' fmm-folder__lock' );
				folder.insertBefore( lock, folder.lastChild );
				folder.insertBefore( $( '<span class="screen-reader-text"></span>' ).text( __( 'Locked', 'fena-media-manager' ) )[ 0 ], folder.lastChild );
			}
			countEl = folder.lastChild;
			countEl.textContent = count;
			countEl.setAttribute( 'aria-label', countLabel( count ) );
			if ( active ) {
				folder.setAttribute( 'aria-current', 'true' );
			}
			if ( isFolder && this.canDrag( ctx ) && this.movable( node ) ) {
				folder.setAttribute( 'draggable', 'true' );
			}
			if ( node && _.contains( COLOR_PRESETS, node.folder.color ) ) {
				folder.setAttribute( 'data-fmm-color', node.folder.color );
			} else if ( node && COLOR_HEX.test( node.folder.color || '' ) ) {
				folder.style.setProperty( '--fmm-folder-color', node.folder.color );
			}
			li.appendChild( folder );

			if ( isFolder ) {
				li.classList.add( 'fmm-sidebar__item--folder', 'fmm-sidebar__item--droppable' );
				this.fillTrailing( li, value, name, ctx );
			}

			return li;
		},

		// Folders that are locked, inside a locked folder, or hold a locked folder keep their place.
		movable: function( node ) {
			return !! node && ! node.protected && ! node.lockedBelow;
		},

		canDrag: function( ctx ) {
			return store.canManage && ! ctx.selected && null === this.editing && ! this.query;
		},

		/**
		 * Trailing part of a folder row: the assign buttons while media is
		 * selected, otherwise the row actions (and the open menu).
		 *
		 * @param {Element} li    Row.
		 * @param {string}  value Folder ID.
		 * @param {string}  name  Folder name.
		 * @param {Object}  ctx   See context().
		 */
		fillTrailing: function( li, value, name, ctx ) {
			var inFolder, actions;

			if ( ctx.selected ) {
				// Assign the selection: "+" when some selected items are not in the folder, "−" when some are.
				inFolder = ctx.counts[ String( Number( value ) ) ] || 0;
				actions = templates().assign.cloneNode( false );
				if ( inFolder < ctx.selected ) {
					actions.appendChild( this.actionButton( 'fmm-folder-add', 'folder-plus', 'add-' + value, addLabel( ctx, name ) ) );
				}
				// "→" moves the selection out of the active folder into this one.
				if ( ctx.source && ctx.source !== value ) {
					actions.appendChild( this.actionButton( 'fmm-folder-move', 'folder-move', 'move-' + value, moveLabel( ctx, name ) ) );
				}
				if ( inFolder > 0 ) {
					actions.appendChild( this.actionButton( 'fmm-folder-remove', 'folder-minus', 'remove-' + value, removeLabel( inFolder, name ) ) );
				}
				li.classList.add( 'has-assign' );
				li.appendChild( actions );
				return;
			}

			if ( store.canManage ) {
				if ( this.needsActions( value ) ) {
					li.appendChild( this.buildActions( value, name ) );
				}
				if ( this.menuOpen === value ) {
					li.classList.add( 'is-menu-open' );
					li.appendChild( this.menu( value )[ 0 ] );
				}
			}
		},

		/**
		 * Lazy row actions need a manager on a hover-capable desktop after a real pointer has been used.
		 *
		 * @return {boolean} Whether lazy mode applies.
		 */
		lazyWanted: function() {
			return !! ( store.canManage && this.mq && this.mq.matches && this.pointerSeen );
		},

		/**
		 * Recomputes lazy mode (media query change, first pointer movement).
		 *
		 * @param {boolean} rerender Whether to render when it changed.
		 */
		updateLazy: function( rerender ) {
			var lazy = this.lazyWanted();

			if ( lazy !== this.lazy ) {
				this.lazy = lazy;
				this.hoverId = null;
				this.focusRowId = this.focusRowOf( document.activeElement );
				if ( rerender ) {
					this.render();
				}
			}
		},

		/**
		 * Whether a folder row has its subfolder and menu buttons. Always, except
		 * in lazy mode (after a real pointer has been used) where only the row that
		 * is hovered, focused, has its menu open, is about to receive focus, or is the last one does.
		 *
		 * @param {string} id Folder ID.
		 * @return {boolean} Whether the actions exist.
		 */
		needsActions: function( id ) {
			return ! this.lazy || id === this.menuOpen || id === this.hoverId || id === this.focusRowId || id === this.prepId || id === this.lastFolderId;
		},

		buildActions: function( value, name ) {
			var actions = templates().actions.cloneNode( false );
			var node = this.node( value );

			if ( ! node || ! node.protected ) {
				actions.appendChild( this.actionButton( 'fmm-folder-subfolder', 'subfolder', 'subfolder-' + value, sprintf( strings().subfolder, name ) ) );
			}
			actions.appendChild( this.menuToggle( value, name ) );

			return actions;
		},

		/**
		 * Adds or removes the actions of one rendered folder row to match needsActions().
		 *
		 * @param {string|null} id Folder ID.
		 */
		syncActions: function( id ) {
			var li, folder, actions;

			if ( ! id || ! this.lazy || ( this.selection && this.selection.length ) ) {
				return;
			}

			li = this.rowOf( id );
			folder = li && store.get( id );
			if ( ! folder || ! li.classList.contains( 'fmm-sidebar__item--folder' ) || ! li.querySelector( '.fmm-folder' ) ) {
				return;
			}

			actions = li.querySelector( ':scope > .fmm-folder__actions' );
			if ( this.needsActions( id ) ) {
				if ( ! actions ) {
					li.appendChild( this.buildActions( id, folder.name ) );
				}
			} else if ( actions && ! li.contains( document.activeElement ) && ! li.classList.contains( 'is-menu-open' ) ) {
				li.removeChild( actions );
			}
		},

		setHover: function( id ) {
			var old = this.hoverId;

			if ( id !== old ) {
				this.hoverId = id;
				this.syncActions( old );
				this.syncActions( id );
			}
		},

		focusRowOf: function( el ) {
			var li = el && el.closest ? el.closest( '.fmm-sidebar__item--folder' ) : null;
			return li && this.$el[ 0 ].contains( li ) ? li.getAttribute( 'data-folder' ) : null;
		},

		setFocusRow: function( id ) {
			var old = this.focusRowId;
			var prep = this.prepId;

			if ( id !== old ) {
				this.focusRowId = id;
				this.syncActions( old );
				this.syncActions( id );
			}
			if ( prep ) {
				this.prepId = null;
				this.syncActions( prep );
			}
		},

		/**
		 * Makes sure a row has its actions before focus moves into it; released once focus settles.
		 *
		 * @param {string} id Folder ID.
		 */
		prepare: function( id ) {
			var self = this;

			this.prepId = id;
			this.syncActions( id );
			setTimeout( function() {
				if ( self.prepId === id ) {
					self.prepId = null;
					self.syncActions( id );
				}
			}, 0 );
		},

		/**
		 * "More actions" button of a folder row.
		 *
		 * @param {string} id   Folder ID.
		 * @param {string} name Folder name.
		 * @return {Element} Button.
		 */
		menuToggle: function( id, name ) {
			var open = this.menuOpen === id;
			var button = this.actionButton( 'fmm-folder-menu-toggle', 'more', 'menu-' + id, sprintf( strings().more, name ) );

			button.setAttribute( 'aria-expanded', String( open ) );
			if ( open ) {
				button.setAttribute( 'aria-controls', 'fmm-folder-menu-' + id );
			}

			return button;
		},

		/**
		 * Actions menu of a folder (inline disclosure). Add entries to the
		 * list to extend it.
		 *
		 * @param {string} id Folder ID.
		 * @return {jQuery} Menu.
		 */
		menu: function( id ) {
			var info = this.siblings( id );
			var index = info ? _.indexOf( info.ids, id ) : -1;
			var manual = 'manual' === store.sort && ! this.query;
			var node = this.node( id );
			var dialogs = window.HTMLDialogElement && HTMLDialogElement.prototype.showModal;
			var locked = !! ( node && node.folder.locked );
			var protectedNode = !! ( node && node.protected );
			var below = !! ( node && node.lockedBelow );
			var items = [];
			var partner = function( delta ) {
				var other = info && info.ids[ index + delta ] ? self.node( info.ids[ index + delta ] ) : null;
				return other && other.folder.locked;
			};
			var self = this;
			var lockItem = locked ?
				{ className: 'fmm-folder-unlock', icon: 'unlock', key: 'unlock-' + id, label: __( 'Unlock folder', 'fena-media-manager' ) } :
				{ className: 'fmm-folder-lock', icon: 'lock', key: 'lock-' + id, label: __( 'Lock folder', 'fena-media-manager' ) };

			if ( ! protectedNode ) {
				items.push( { className: 'fmm-folder-rename', icon: 'rename', key: 'rename-' + id, label: __( 'Rename', 'fena-media-manager' ) } );
				if ( dialogs && ! below ) {
					items.push( { className: 'fmm-folder-moveto', icon: 'move-to', key: 'moveto-' + id, label: __( 'Move to…', 'fena-media-manager' ) } );
				}
			}
			if ( dialogs ) {
				items.push( { className: 'fmm-folder-color', icon: 'color', key: 'color-' + id, label: __( 'Appearance…', 'fena-media-manager' ) } );
			}
			if ( ! protectedNode && manual && index > 0 && ! partner( -1 ) ) {
				items.push( { className: 'fmm-folder-up', icon: 'move-up', key: 'up-' + id, label: __( 'Move up', 'fena-media-manager' ) } );
			}
			if ( ! protectedNode && manual && index >= 0 && index < info.ids.length - 1 && ! partner( 1 ) ) {
				items.push( { className: 'fmm-folder-down', icon: 'move-down', key: 'down-' + id, label: __( 'Move down', 'fena-media-manager' ) } );
			}
			items.push( lockItem );
			if ( ! protectedNode && ! below ) {
				items.push( { className: 'fmm-folder-delete', icon: 'delete', key: 'delete-' + id, label: __( 'Delete', 'fena-media-manager' ) } );
			}

			return $( '<div class="fmm-menu"></div>' ).attr( 'id', 'fmm-folder-menu-' + id ).append( _.map( items, function( item ) {
				return $( '<button type="button" class="fmm-menu__item"></button>' )
					.addClass( item.className )
					.attr( 'data-fmm-key', item.key )
					.append( icon( item.icon ), $( '<span></span>' ).text( item.label ) );
			} ) );
		},

		/**
		 * Expand/collapse button of a folder with subfolders.
		 *
		 * @param {Object} folder Folder.
		 * @return {Element} Button.
		 */
		toggleButton: function( folder ) {
			var expanded = !! this.query || !! this.expanded[ String( folder.id ) ];
			var label = sprintf( expanded ? strings().hide : strings().show, folder.name );
			var button = templates().toggle.cloneNode( false );

			button.setAttribute( 'aria-expanded', String( expanded ) );
			button.setAttribute( 'aria-label', label );
			button.setAttribute( 'title', label );
			button.setAttribute( 'data-fmm-key', 'toggle-' + folder.id );
			button.disabled = !! this.query;
			button.appendChild( iconEl( expanded ? 'expanded' : 'collapsed' ) );

			return button;
		},

		toggleFolder: function( id ) {
			this.expanded[ id ] = ! this.expanded[ id ];
			this.render();
		},

		actionButton: function( className, iconName, key, label ) {
			var id = className + ' ' + iconName;
			var button = ( actionTpl[ id ] || ( actionTpl[ id ] = ( function() {
				var node = tag( 'button', 'button-link ' + className, 'button' );
				node.appendChild( iconEl( iconName ) );
				return node;
			}() ) ) ).cloneNode( true );

			button.setAttribute( 'data-fmm-key', key );
			button.setAttribute( 'aria-label', label );
			button.setAttribute( 'title', label );

			return button;
		},

		form: function( value ) {
			var id = 'fmm-folder-name-input';

			return $( '<form class="fmm-form"></form>' ).append(
				$( '<label class="screen-reader-text"></label>' ).attr( 'for', id ).text( __( 'Folder name', 'fena-media-manager' ) ),
				$( '<input type="text" class="fmm-form__input" maxlength="200" />' ).attr( 'id', id ).val( value || '' ),
				$( '<span class="fmm-form__buttons"></span>' ).append(
					$( '<button type="submit" class="button button-primary button-small"></button>' ).text( __( 'Save', 'fena-media-manager' ) ),
					$( '<button type="button" class="button button-small fmm-form-cancel"></button>' ).text( __( 'Cancel', 'fena-media-manager' ) )
				)
			);
		},

		render: function() {
			var self = this;
			var focusKey, ctx, tree, visible, frag, shown, hadSearch;

			// Drags keep the DOM they started on; endDrag() renders afterwards.
			if ( this.dragIds || this.dragFolder ) {
				this.renderPending = true;
				return;
			}
			this.renderPending = false;
			hadSearch = !! this.searchTimer;
			clearTimeout( this.searchTimer );
			this.searchTimer = 0;
			focusKey = this.focusedKey();
			ctx = this.context();
			tree = store.tree();
			visible = this.query ? this.searchVisible( tree ) : null;

			if ( this.menuOpen && ( ctx.selected || null !== this.editing || ! store.get( this.menuOpen ) || ( visible && ! visible[ this.menuOpen ] ) ) ) {
				this.menuOpen = null;
			}

			this.hasTree = _.some( tree, function( node ) {
				return node.hasChildren;
			} );
			this.$el.toggleClass( 'has-tree', this.hasTree );

			frag = document.createDocumentFragment();
			frag.appendChild( this.row( '', __( 'All Media', 'fena-media-manager' ), store.total, 'all', false, ctx ) );
			frag.appendChild( this.row( 'none', __( 'Unassigned', 'fena-media-manager' ), store.unassigned, 'unassigned', false, ctx ) );

			if ( 'new' === this.editing && ! this.newParent ) {
				frag.appendChild( $( '<li class="fmm-sidebar__item fmm-sidebar__item--new"></li>' ).append( this.form( '' ) )[ 0 ] );
			}

			if ( visible && ! this.matchCount ) {
				frag.appendChild( $( '<li class="fmm-sidebar__item fmm-sidebar__empty"></li>' ).text( __( 'No folders found.', 'fena-media-manager' ) )[ 0 ] );
			}

			// Rows below a collapsed folder are not rendered; the folder filter is unaffected.
			// While searching, matches and their ancestors are shown regardless of this.expanded.
			shown = _.filter( tree, function( node ) {
				return visible ? visible[ String( node.folder.id ) ] : ! _.some( node.parents, function( parent ) {
					return ! self.expanded[ parent ];
				} );
			} );
			this.lastFolderId = shown.length ? String( shown[ shown.length - 1 ].folder.id ) : null;

			_.each( shown, function( node ) {
				var id = String( node.folder.id );
				var $new;

				frag.appendChild( self.row( id, node.folder.name, node.folder.count, 'folder', true, ctx, node ) );

				if ( 'new' === self.editing && self.newParent === id ) {
					$new = $( '<li class="fmm-sidebar__item fmm-sidebar__item--new"></li>' ).append( self.form( '' ) );
					$new[ 0 ].style.setProperty( '--fmm-depth', node.depth + 1 );
					frag.appendChild( $new[ 0 ] );
				}
			} );

			// Native clearing: rows carry no jQuery data (see rowValue()).
			this.list.textContent = '';
			this.list.appendChild( frag );

			this.syncSort();
			this.renderSelectionUi( ctx.selected );

			// The active folder was deleted elsewhere: fall back to all media.
			if ( this.current() && 'none' !== this.current() && ! store.get( this.current() ) ) {
				this.library.props.set( PROP, null );
			}

			this.renderActive();

			if ( this.$el.find( '.fmm-form__input' ).length && document.activeElement !== this.$el.find( '.fmm-search__input' )[ 0 ] ) {
				this.$el.find( '.fmm-form__input' ).trigger( 'focus' ).trigger( 'select' );
			} else if ( focusKey ) {
				this.focusKey( focusKey );
			}

			if ( hadSearch ) {
				this.announceSearch( false );
			}
		},

		/**
		 * data-fmm-key of the focused element inside the sidebar, if any.
		 *
		 * @return {string|null} Key.
		 */
		focusedKey: function() {
			return $( document.activeElement ).closest( this.$el ).length ? $( document.activeElement ).attr( 'data-fmm-key' ) : null;
		},

		/**
		 * Selection hint and has-selection class.
		 *
		 * @param {number} selected Number of selected media files.
		 */
		renderSelectionUi: function( selected ) {
			this.$el.toggleClass( 'has-selection', selected > 0 );
			this.$el.find( '.fmm-sidebar__selection' ).prop( 'hidden', ! selected ).text( ! selected ? '' : ( this.currentFolder() ?
				/* translators: %d: number of selected media files. */
				sprintf( _n( '%d media file selected. Use +, → or − next to a folder, or drag the selection onto a folder to move it (hold Ctrl/⌘ to add it instead).', '%d media files selected. Use +, → or − next to a folder, or drag the selection onto a folder to move it (hold Ctrl/⌘ to add it instead).', selected, 'fena-media-manager' ), selected ) :
				/* translators: %d: number of selected media files. */
				sprintf( _n( '%d media file selected. Use + or − next to a folder, or drag the selection onto a folder.', '%d media files selected. Use + or − next to a folder, or drag the selection onto a folder.', selected, 'fena-media-manager' ), selected ) ) );
		},

		/**
		 * The row element of a filter value, if rendered.
		 *
		 * @param {string} value '' = all, 'none', or a folder ID.
		 * @return {Element|null} Row.
		 */
		rowOf: function( value ) {
			return this.list.querySelector( '[data-folder="' + String( value ).replace( /["\\]/g, '\\$&' ) + '"]' );
		},

		/**
		 * Folders shown while searching: matches and all their ancestors.
		 *
		 * @param {Object[]} tree Nodes from store.tree().
		 * @return {Object} Folder ID => true. Also sets this.matchCount.
		 */
		searchVisible: function( tree ) {
			var self = this;
			var visible = {};

			this.matchCount = 0;
			_.each( tree, function( node ) {
				if ( self.findMatch( node.folder.name ) ) {
					self.matchCount++;
					visible[ String( node.folder.id ) ] = true;
					_.each( node.parents, function( parent ) {
						visible[ parent ] = true;
					} );
				}
			} );

			return visible;
		},

		renderActive: function() {
			this.activeRow = this.rowOf( this.current() );
		},

		/**
		 * Marks a row as (in)active: class, aria-current and the open/closed folder icon.
		 *
		 * @param {Element|null} li     Row.
		 * @param {boolean}      active Whether it is the active folder.
		 */
		setActive: function( li, active ) {
			var button, use, href;

			if ( ! li ) {
				return;
			}

			li.classList.toggle( 'is-active', active );
			button = li.querySelector( '.fmm-folder' );
			if ( ! button ) {
				return;
			}
			if ( active ) {
				button.setAttribute( 'aria-current', 'true' );
			} else {
				button.removeAttribute( 'aria-current' );
			}
			if ( li.classList.contains( 'fmm-sidebar__item--folder' ) ) {
				use = button.querySelector( 'use' );
				href = '#fmm-i-' + ( active ? 'folder-open' : 'folder' );
				if ( use && use.getAttribute( 'href' ) !== href ) {
					use.setAttribute( 'href', href );
				}
			}
		},

		/**
		 * The active folder changed: updates only the two rows involved. The
		 * selection hint and the "→" buttons depend on the active folder, and
		 * menus and forms on the rows, so those cases render in full.
		 */
		folderChanged: function() {
			var current = this.current();
			var next;

			if ( this.dragIds || this.dragFolder || ( this.selection && this.selection.length ) || null !== this.editing || this.menuOpen || ( /^\d+$/.test( current ) && ! store.get( current ) ) ) {
				this.render();
				return;
			}

			next = this.rowOf( current );
			if ( next !== this.activeRow ) {
				this.setActive( this.activeRow, false );
				this.setActive( next, true );
				this.activeRow = next;
			}
		},

		/*
		 * Selection events come in bursts (select all, shift-click ranges):
		 * one update per animation frame instead of one per event.
		 */
		queueSelection: function() {
			var self = this;

			if ( this.dragIds || this.dragFolder ) {
				this.renderPending = true;
				return;
			}
			if ( ! this.selectionFrame ) {
				this.selectionFrame = window.requestAnimationFrame( function() {
					self.selectionFrame = 0;
					self.updateSelection();
				} );
			}
		},

		/**
		 * Applies a selection change without rebuilding the list: replaces the
		 * trailing buttons of every rendered folder row. Produces the same DOM as render().
		 */
		updateSelection: function() {
			var self = this;
			var active = document.activeElement;
			var focusKey, ctx;

			if ( this.dragIds || this.dragFolder ) {
				this.renderPending = true;
				return;
			}

			focusKey = this.focusedKey();
			ctx = this.context();
			if ( this.menuOpen && ( ctx.selected || null !== this.editing ) ) {
				this.menuOpen = null;
			}

			Array.prototype.forEach.call( this.list.querySelectorAll( '.fmm-sidebar__item--folder' ), function( li ) {
				var value = li.getAttribute( 'data-folder' );
				var folder = store.get( value );
				var button = li.querySelector( '.fmm-folder' );
				var i, child;

				if ( ! folder || ! button ) {
					return;
				}

				for ( i = li.children.length - 1; i >= 0; i-- ) {
					child = li.children[ i ];
					if ( child.classList.contains( 'fmm-folder__assign' ) || child.classList.contains( 'fmm-folder__actions' ) || child.classList.contains( 'fmm-menu' ) ) {
						li.removeChild( child );
					}
				}
				li.classList.remove( 'has-assign', 'is-menu-open' );
				if ( self.canDrag( ctx ) && self.movable( self.node( value ) ) ) {
					button.setAttribute( 'draggable', 'true' );
				} else {
					button.removeAttribute( 'draggable' );
				}
				self.fillTrailing( li, value, folder.name, ctx );
			} );

			this.renderSelectionUi( ctx.selected );

			if ( focusKey && ! document.contains( active ) ) {
				this.focusKey( focusKey );
			}
		},

		/**
		 * Restores focus after re-rendering; falls back to the folder button.
		 *
		 * @param {string} key data-fmm-key of the element.
		 */
		focusKey: function( key ) {
			var $target = this.$el.find( '[data-fmm-key="' + key + '"]' );
			var action = /^(?:menu|subfolder|up|down)-(.+)$/.exec( key );

			if ( ! $target.length && action ) {
				this.prepare( action[ 1 ] );
				$target = this.$el.find( '[data-fmm-key="' + key + '"]' );
			}
			if ( ! $target.length ) {
				$target = this.$el.find( '[data-fmm-key="folder-' + String( key ).replace( /^[a-z]+-/, '' ) + '"]' );
			}
			$target.first().trigger( 'focus' );
		},

		/**
		 * Opens the inline form.
		 *
		 * @param {string} id       Folder ID to rename, or 'new'.
		 * @param {string} [parent] Parent folder ID for a new subfolder.
		 */
		startEdit: function( id, parent ) {
			var guard = this.node( 'new' === id ? parent : id );

			// A locked folder neither gets renamed nor receives subfolders.
			if ( guard && guard.protected ) {
				return;
			}
			this.closeSort( false );
			this.editing = id;
			this.menuOpen = null;
			this.newParent = 'new' === id && parent ? String( parent ) : '';
			if ( this.newParent ) {
				this.expanded[ this.newParent ] = true;
			}
			this.notice( '' );
			this.render();
		},

		stopEdit: function() {
			var previous = this.editing;
			var parent = this.newParent;
			this.editing = null;
			this.newParent = '';
			this.render();
			if ( 'new' === previous ) {
				this.focusKey( parent ? 'subfolder-' + parent : 'new' );
			} else {
				this.focusKey( 'folder-' + previous );
			}
		},

		/**
		 * Visible and announced feedback.
		 *
		 * @param {string} message Message ('' hides the notice).
		 * @param {string} type    success, warning or error.
		 */
		notice: function( message, type ) {
			var $notice = this.$el.find( '.fmm-sidebar__notice' );
			type = type || 'error';
			$notice.removeClass( 'notice-success notice-warning notice-error' ).addClass( 'notice-' + type )
				.attr( 'role', 'error' === type ? 'alert' : 'status' );
			$notice.find( 'p' ).text( message );
			$notice.find( '.fmm-notice-ui__icon' ).empty().append( icon( 'notice-' + type ) );
			$notice.prop( 'hidden', ! message );
			if ( message && wp.a11y ) {
				wp.a11y.speak( message, 'error' === type ? 'assertive' : 'polite' );
			}
		},

		fail: function( error, fallback ) {
			this.busy = false;
			this.notice( ( error && error.message ) || fallback || __( 'The folder could not be saved.', 'fena-media-manager' ), 'error' );
		},

		save: function( rawName ) {
			var self = this;
			var name = $.trim( rawName || '' );
			var isNew = 'new' === this.editing;
			var data = { name: name };

			if ( this.busy ) {
				return;
			}
			if ( ! name ) {
				this.notice( __( 'Please enter a folder name.', 'fena-media-manager' ), 'error' );
				return;
			}
			if ( isNew && this.newParent ) {
				data.parent = Number( this.newParent );
			}

			this.busy = true;
			wp.apiFetch( {
				path: isNew ? '/fmm/v1/folders' : '/fmm/v1/folders/' + this.editing,
				method: isNew ? 'POST' : 'PATCH',
				data: data
			} ).then( function( folder ) {
				self.busy = false;
				self.editing = null;
				self.newParent = '';
				self.notice( isNew ?
					/* translators: %s: folder name. */
					sprintf( __( 'Folder “%s” created.', 'fena-media-manager' ), folder.name ) :
					/* translators: %s: folder name. */
					sprintf( __( 'Folder renamed to “%s”.', 'fena-media-manager' ), folder.name ), 'success' );
				return store.refresh().then( function() {
					self.focusKey( 'folder-' + folder.id );
				} );
			} ).catch( function( error ) {
				self.fail( error );
			} );
		},

		/**
		 * Locks or unlocks a folder.
		 *
		 * @param {string}  id     Folder ID.
		 * @param {boolean} locked Whether to lock.
		 */
		setLocked: function( id, locked ) {
			var self = this;
			var folder = store.get( id );

			if ( ! folder || this.busy ) {
				return;
			}

			this.menuOpen = null;
			this.busy = true;
			wp.apiFetch( { path: '/fmm/v1/folders/' + id, method: 'PATCH', data: { locked: locked } } ).then( function() {
				self.busy = false;
				self.notice( locked ?
					/* translators: %s: folder name. */
					sprintf( __( 'Folder “%s” locked.', 'fena-media-manager' ), folder.name ) :
					/* translators: %s: folder name. */
					sprintf( __( 'Folder “%s” unlocked.', 'fena-media-manager' ), folder.name ), 'success' );
				return store.refresh().then( function() {
					self.focusKey( 'folder-' + id );
				} );
			} ).catch( function( error ) {
				self.fail( error );
			} );
		},

		remove: function( id ) {
			var self = this;
			var folder = store.get( id );
			var message;

			function run( api ) {
				self.menuOpen = null;
				self.busy = true;
				wp.apiFetch( { path: '/fmm/v1/folders/' + id, method: 'DELETE' } ).then( function() {
					self.busy = false;
					if ( api ) {
						api.close();
					}
					if ( self.current() === String( id ) ) {
						self.library.props.set( PROP, null );
					}
					/* translators: %s: folder name. */
					self.notice( sprintf( __( 'Folder “%s” deleted.', 'fena-media-manager' ), folder.name ), 'success' );
					return store.refresh().then( function() {
						self.focusKey( 'folder-' );
					} );
				} ).catch( function( error ) {
					if ( api ) {
						self.busy = false;
						api.busy( false );
						api.error( ( error && error.message ) || __( 'The folder could not be deleted.', 'fena-media-manager' ) );
						return;
					}
					self.fail( error );
				} );
			}

			if ( ! folder || this.busy ) {
				return;
			}
			/* translators: %s: folder name. */
			message = sprintf( __( 'Delete the folder “%s”? The media files stay in your library.', 'fena-media-manager' ), folder.name );
			// Core moves the subfolders of a deleted term one level up.
			if ( _.some( store.folders, function( other ) {
				return String( other.parent ) === String( id );
			} ) ) {
				message += ' ' + __( 'Its subfolders move up one level.', 'fena-media-manager' );
			}

			if ( window.HTMLDialogElement && HTMLDialogElement.prototype.showModal ) {
				this.dialog( {
					title: __( 'Delete folder', 'fena-media-manager' ),
					className: 'fmm-dialog--delete',
					describe: true,
					initialFocus: 'cancel',
					body: $( '<p></p>' ).text( message ),
					submit: __( 'Delete', 'fena-media-manager' ),
					focus: 'folder-' + id,
					onSubmit: function( api ) {
						if ( self.busy ) {
							return;
						}
						api.error( '' );
						api.busy( true );
						run( api );
					}
				} );
				return;
			}

			if ( window.confirm( message ) ) {
				run( null );
			}
		},

		/**
		 * Adds media to a folder, removes it from one, or moves it from the
		 * active folder into another one. Only the named folders change; all
		 * other folder assignments stay. The server checks every item.
		 *
		 * @param {number[]} ids      Attachment IDs.
		 * @param {number}   folderId Folder ID.
		 * @param {string}   mode     'add', 'remove' or 'move'.
		 */
		assign: function( ids, folderId, mode ) {
			var self = this;
			var folder = store.get( folderId );
			var current = this.current();
			var source = 'move' === mode ? this.currentFolder() : '';
			var add = 'remove' !== mode;
			var data;

			if ( ! folder || ! ids.length || this.busy ) {
				return;
			}

			// Moving into the active folder itself is a plain add.
			if ( 'move' === mode && ( ! source || source === String( folderId ) ) ) {
				mode = 'add';
			}

			data = { attachment_ids: ids, folder_ids: [ Number( folderId ) ], mode: mode };
			if ( 'move' === mode ) {
				data.source_folder = Number( source );
			}

			this.busy = true;
			wp.apiFetch( {
				path: '/fmm/v1/assign',
				method: 'POST',
				data: data
			} ).then( function( result ) {
				var done = result.updated.length;
				var skipped = result.skipped.length;
				var message;

				self.busy = false;
				_.each( result.updated, function( item ) {
					wp.media.model.Attachment.get( item.id ).set( 'fmmFolders', item.folders );
				} );

				if ( 'move' === mode ) {
					/* translators: 1: number of media files, 2: source folder name, 3: target folder name. */
					message = sprintf( _n( '%1$d media file moved from “%2$s” to “%3$s”.', '%1$d media files moved from “%2$s” to “%3$s”.', done, 'fena-media-manager' ), done, ( store.get( source ) || {} ).name, folder.name );
				} else if ( add ) {
					/* translators: 1: number of media files, 2: folder name. */
					message = sprintf( _n( '%1$d media file added to “%2$s”.', '%1$d media files added to “%2$s”.', done, 'fena-media-manager' ), done, folder.name );
				} else {
					/* translators: 1: number of media files, 2: folder name. */
					message = sprintf( _n( '%1$d media file removed from “%2$s”.', '%1$d media files removed from “%2$s”.', done, 'fena-media-manager' ), done, folder.name );
				}
				if ( skipped ) {
					/* translators: %d: number of media files. */
					message += ' ' + sprintf( _n( '%d media file could not be changed (missing permission).', '%d media files could not be changed (missing permission).', skipped, 'fena-media-manager' ), skipped );
				}
				self.notice( message, skipped ? 'warning' : 'success' );

				/*
				 * Media that left the current view is already removed by the
				 * folder query; reloading keeps pagination in sync.
				 */
				if ( 'move' === mode || ( add && 'none' === current ) || ( ! add && String( folderId ) === current ) ) {
					// Media that is no longer visible must not stay selected.
					if ( self.selection ) {
						self.selection.remove( _.pluck( result.updated, 'id' ) );
					}
					if ( _.isFunction( self.library._requery ) ) {
						self.library._requery();
					}
				}

				return store.refresh();
			} ).catch( function( error ) {
				if ( error && 'fmm_nothing_updated' === error.code ) {
					/* translators: %d: number of media files. */
					self.fail( null, sprintf( _n( 'The media file could not be changed (missing permission).', 'None of the %d media files could be changed (missing permission).', ids.length, 'fena-media-manager' ), ids.length ) );
					return;
				}
				self.fail( error, __( 'The folder assignment could not be saved.', 'fena-media-manager' ) );
			} );
		}
	} );

	$( document ).on( 'wp-media-grid-ready', function( event, frame ) {
		var sidebar, $wrap;

		if ( ! frame || ! frame.$el || ! frame.state || ! frame.state().get( 'library' ) ) {
			return;
		}

		if ( fmm.bindUploader ) {
			fmm.bindUploader( frame.uploader );
		}

		sidebar = new Sidebar( frame );
		$wrap = frame.$el.parent();
		if ( $wrap.is( '#wp-media-grid' ) ) {
			$wrap.addClass( 'fmm-layout' );
		} else {
			frame.$el.wrap( '<div class="fmm-layout"></div>' );
		}
		// The rail sits before the grid so reading and tab order stay: heading, notices, folders, grid.
		$( '<div class="fmm fmm-layout__rail"></div>' ).append( sidebar.$el ).insertBefore( frame.$el );

		// The grid computes its columns from the container width.
		$( window ).trigger( 'resize' );
	} );
}( jQuery, _, window.wp ) );
