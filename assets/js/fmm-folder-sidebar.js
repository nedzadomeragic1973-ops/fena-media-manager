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

	if ( ! fmm || ! wp || ! wp.apiFetch ) {
		return;
	}

	var __ = wp.i18n.__;
	var _n = wp.i18n._n;
	var sprintf = wp.i18n.sprintf;
	var store = fmm.store;
	var PROP = fmm.prop;
	var DRAG_TYPE = 'application/x-fmm-media';

	/*
	 * Logical icon names, mapped to Dashicons for now. Replacing this map
	 * (e.g. with local SVGs) is the only change needed for new icons.
	 */
	var ICONS = {
		all: 'admin-media',
		unassigned: 'marker',
		folder: 'category',
		'folder-plus': 'plus-alt2',
		'folder-minus': 'minus',
		'folder-move': 'arrow-right-alt',
		create: 'plus-alt2',
		subfolder: 'plus-alt2',
		collapsed: 'arrow-right-alt2',
		expanded: 'arrow-down-alt2',
		rename: 'edit',
		'delete': 'trash'
	};

	function icon( name ) {
		return $( '<span aria-hidden="true"></span>' ).addClass( 'dashicons dashicons-' + ( ICONS[ name ] || name ) );
	}

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

		this.$el = $( '<nav class="fmm-sidebar"></nav>' ).attr( 'aria-label', __( 'Folders', 'fena-media-manager' ) );
		this.$el.append(
			$( '<div class="fmm-sidebar__header"></div>' ).append(
				$( '<h2 class="fmm-sidebar__title"></h2>' ).text( __( 'Folders', 'fena-media-manager' ) ),
				store.canManage ? $( '<button type="button" class="button button-small fmm-sidebar__new" data-fmm-key="new"></button>' )
					.append( icon( 'create' ), $( '<span></span>' ).text( __( 'New Folder', 'fena-media-manager' ) ) ) : null
			),
			$( '<div class="fmm-sidebar__notice notice inline is-dismissible" hidden></div>' ).append(
				'<p></p>',
				$( '<button type="button" class="notice-dismiss"></button>' ).append(
					$( '<span class="screen-reader-text"></span>' ).text( __( 'Dismiss this notice.', 'fena-media-manager' ) )
				)
			),
			'<p class="fmm-sidebar__selection" hidden></p>',
			'<ul class="fmm-sidebar__list"></ul>'
		);

		this.bind();
		this.bindDrag();
		this.render();
	}

	_.extend( Sidebar.prototype, {

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
		 * How many selected items are already in a folder.
		 *
		 * @param {number} folderId Folder ID.
		 * @return {number} Count.
		 */
		selectedInFolder: function( folderId ) {
			return this.selection ? this.selection.filter( function( model ) {
				return _.contains( _.map( model.get( 'fmmFolders' ) || [], Number ), Number( folderId ) );
			} ).length : 0;
		},

		bind: function() {
			var self = this;

			store.on( 'change', this.render, this );
			this.library.props.on( 'change:' + PROP, this.render, this );
			if ( this.selection ) {
				this.selection.on( 'add remove reset change:fmmFolders', this.render, this );
			}

			this.$el.on( 'click', '.fmm-sidebar__new', function() {
				self.startEdit( 'new' );
			} );

			this.$el.on( 'click', '.fmm-folder', function() {
				var value = String( $( this ).closest( 'li' ).data( 'folder' ) );
				self.library.props.set( PROP, '' === value ? null : value );
			} );

			// Separate button: expanding never selects the folder.
			this.$el.on( 'click', '.fmm-folder-toggle[aria-expanded]', function() {
				self.toggleFolder( String( $( this ).closest( 'li' ).data( 'folder' ) ) );
			} );

			this.$el.on( 'click', '.fmm-folder-subfolder', function() {
				self.startEdit( 'new', String( $( this ).closest( 'li' ).data( 'folder' ) ) );
			} );

			this.$el.on( 'click', '.fmm-folder-rename', function() {
				self.startEdit( String( $( this ).closest( 'li' ).data( 'folder' ) ) );
			} );

			this.$el.on( 'click', '.fmm-folder-delete', function() {
				self.remove( String( $( this ).closest( 'li' ).data( 'folder' ) ) );
			} );

			this.$el.on( 'click', '.fmm-folder-add, .fmm-folder-remove, .fmm-folder-move', function() {
				var $button = $( this );
				var mode = $button.hasClass( 'fmm-folder-move' ) ? 'move' : 'add';
				self.assign( self.selectedIds(), $button.closest( 'li' ).data( 'folder' ), $button.hasClass( 'fmm-folder-remove' ) ? 'remove' : mode );
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
				if ( ! self.dragIds ) {
					return;
				}
				event.stopPropagation();
				row = $( event.target ).closest( '.fmm-sidebar__item--droppable' );
				if ( row.length ) {
					event.preventDefault();
					event.dataTransfer.dropEffect = 'move' === self.dropMode( event, row.data( 'folder' ) ) ? 'move' : 'copy';
				}
				self.highlight( row );
			}

			function drop( event ) {
				var row;
				var ids = self.dragIds;
				if ( ! ids ) {
					return;
				}
				event.stopPropagation();
				event.preventDefault();
				row = $( event.target ).closest( '.fmm-sidebar__item--droppable' );
				self.endDrag();
				if ( row.length ) {
					self.assign( ids, row.data( 'folder' ), self.dropMode( event, row.data( 'folder' ) ) );
				}
			}

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
			ghost = $( '<div class="fmm-drag-ghost"></div>' ).text( sprintf( _n( '%d media file', '%d media files', count, 'fena-media-manager' ), count ) ).appendTo( document.body );
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
			this.highlight( null );
			this.$el.removeClass( 'is-dragging' );
		},

		/**
		 * One list row.
		 *
		 * @param {string}  value    Filter value ('' = all, 'none', or ID).
		 * @param {string}  name     Label.
		 * @param {number}  count    Media count.
		 * @param {string}  iconName Icon name.
		 * @param {boolean} isFolder Whether this is a real folder.
		 * @param {Object}  [node]   Tree node from store.tree().
		 * @return {jQuery} Row.
		 */
		row: function( value, name, count, iconName, isFolder, node ) {
			var selected = this.selectedIds().length;
			var source = this.currentFolder();
			var $li = $( '<li class="fmm-sidebar__item"></li>' ).attr( 'data-folder', value );
			var inFolder, $actions;

			if ( node && node.depth ) {
				$li[ 0 ].style.setProperty( '--fmm-depth', node.depth );
			}

			if ( isFolder && String( this.editing ) === value ) {
				return $li.append( this.form( name ) );
			}

			// Chevron column (only while any folder has subfolders); leaves keep the space.
			if ( this.hasTree ) {
				$li.append( node && node.hasChildren ? this.toggleButton( node.folder ) : '<span class="fmm-folder-toggle fmm-folder-toggle--empty" aria-hidden="true"></span>' );
			}

			$li.append(
				$( '<button type="button" class="fmm-folder"></button>' ).attr( 'data-fmm-key', 'folder-' + value ).append(
					icon( iconName ),
					$( '<span class="fmm-folder__name"></span>' ).text( name ),
					$( '<span class="fmm-folder__count"></span>' ).text( count )
						/* translators: %d: number of media items. */
						.attr( 'aria-label', sprintf( _n( '%d item', '%d items', count, 'fena-media-manager' ), count ) )
				)
			);

			if ( ! isFolder ) {
				return $li;
			}

			$li.addClass( 'fmm-sidebar__item--folder fmm-sidebar__item--droppable' );

			if ( selected ) {
				// Assign the selection: "+" when some selected items are not in the folder, "−" when some are.
				inFolder = this.selectedInFolder( value );
				$actions = $( '<span class="fmm-folder__assign"></span>' );
				if ( inFolder < selected ) {
					$actions.append( this.actionButton( 'fmm-folder-add', 'folder-plus', 'add-' + value,
						/* translators: 1: number of media files, 2: folder name. */
						sprintf( _n( 'Add %1$d selected media file to “%2$s”', 'Add %1$d selected media files to “%2$s”', selected, 'fena-media-manager' ), selected, name ) ) );
				}
				// "→" moves the selection out of the active folder into this one.
				if ( source && source !== value ) {
					$actions.append( this.actionButton( 'fmm-folder-move', 'folder-move', 'move-' + value,
						/* translators: 1: number of media files, 2: source folder name, 3: target folder name. */
						sprintf( _n( 'Move %1$d selected media file from “%2$s” to “%3$s”', 'Move %1$d selected media files from “%2$s” to “%3$s”', selected, 'fena-media-manager' ), selected, store.get( source ).name, name ) ) );
				}
				if ( inFolder > 0 ) {
					$actions.append( this.actionButton( 'fmm-folder-remove', 'folder-minus', 'remove-' + value,
						/* translators: 1: number of media files, 2: folder name. */
						sprintf( _n( 'Remove %1$d selected media file from “%2$s”', 'Remove %1$d selected media files from “%2$s”', inFolder, 'fena-media-manager' ), inFolder, name ) ) );
				}
				return $li.addClass( 'has-assign' ).append( $actions );
			}

			if ( store.canManage ) {
				$li.append(
					$( '<span class="fmm-folder__actions"></span>' ).append(
						/* translators: %s: folder name. */
						this.actionButton( 'fmm-folder-subfolder', 'subfolder', 'subfolder-' + value, sprintf( __( 'New subfolder in “%s”', 'fena-media-manager' ), name ) ),
						/* translators: %s: folder name. */
						this.actionButton( 'fmm-folder-rename', 'rename', 'rename-' + value, sprintf( __( 'Rename folder “%s”', 'fena-media-manager' ), name ) ),
						/* translators: %s: folder name. */
						this.actionButton( 'fmm-folder-delete', 'delete', 'delete-' + value, sprintf( __( 'Delete folder “%s”', 'fena-media-manager' ), name ) )
					)
				);
			}

			return $li;
		},

		/**
		 * Expand/collapse button of a folder with subfolders.
		 *
		 * @param {Object} folder Folder.
		 * @return {jQuery} Button.
		 */
		toggleButton: function( folder ) {
			var expanded = !! this.expanded[ String( folder.id ) ];
			var label = expanded ?
				/* translators: %s: folder name. */
				sprintf( __( 'Hide subfolders of “%s”', 'fena-media-manager' ), folder.name ) :
				/* translators: %s: folder name. */
				sprintf( __( 'Show subfolders of “%s”', 'fena-media-manager' ), folder.name );

			return $( '<button type="button" class="fmm-folder-toggle"></button>' )
				.attr( { 'aria-expanded': String( expanded ), 'aria-label': label, title: label, 'data-fmm-key': 'toggle-' + folder.id } )
				.append( icon( expanded ? 'expanded' : 'collapsed' ) );
		},

		toggleFolder: function( id ) {
			this.expanded[ id ] = ! this.expanded[ id ];
			this.render();
		},

		actionButton: function( className, iconName, key, label ) {
			return $( '<button type="button" class="button-link"></button>' )
				.addClass( className )
				.attr( { 'data-fmm-key': key, 'aria-label': label, title: label } )
				.append( icon( iconName ) );
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
			var $list = this.$el.find( '.fmm-sidebar__list' );
			var focusKey = $( document.activeElement ).closest( this.$el ).length ? $( document.activeElement ).attr( 'data-fmm-key' ) : null;
			var selected = this.selectedIds().length;
			var tree = store.tree();

			this.hasTree = _.some( tree, function( node ) {
				return node.hasChildren;
			} );
			this.$el.toggleClass( 'has-tree', this.hasTree );

			$list.empty();
			$list.append( this.row( '', __( 'All Media', 'fena-media-manager' ), store.total, 'all', false ) );
			$list.append( this.row( 'none', __( 'Unassigned', 'fena-media-manager' ), store.unassigned, 'unassigned', false ) );

			if ( 'new' === this.editing && ! this.newParent ) {
				$list.append( $( '<li class="fmm-sidebar__item fmm-sidebar__item--new"></li>' ).append( this.form( '' ) ) );
			}

			// Rows below a collapsed folder are not rendered; the folder filter is unaffected.
			_.each( tree, function( node ) {
				var id = String( node.folder.id );
				var $new;

				if ( _.some( node.parents, function( parent ) {
					return ! self.expanded[ parent ];
				} ) ) {
					return;
				}

				$list.append( self.row( id, node.folder.name, node.folder.count, 'folder', true, node ) );

				if ( 'new' === self.editing && self.newParent === id ) {
					$new = $( '<li class="fmm-sidebar__item fmm-sidebar__item--new"></li>' ).append( self.form( '' ) );
					$new[ 0 ].style.setProperty( '--fmm-depth', node.depth + 1 );
					$list.append( $new );
				}
			} );

			this.$el.toggleClass( 'has-selection', selected > 0 );
			this.$el.find( '.fmm-sidebar__selection' ).prop( 'hidden', ! selected ).text( ! selected ? '' : ( this.currentFolder() ?
				/* translators: %d: number of selected media files. */
				sprintf( _n( '%d media file selected. Use +, → or − next to a folder, or drag the selection onto a folder to move it (hold Ctrl/⌘ to add it instead).', '%d media files selected. Use +, → or − next to a folder, or drag the selection onto a folder to move it (hold Ctrl/⌘ to add it instead).', selected, 'fena-media-manager' ), selected ) :
				/* translators: %d: number of selected media files. */
				sprintf( _n( '%d media file selected. Use + or − next to a folder, or drag the selection onto a folder.', '%d media files selected. Use + or − next to a folder, or drag the selection onto a folder.', selected, 'fena-media-manager' ), selected ) ) );

			// The active folder was deleted elsewhere: fall back to all media.
			if ( this.current() && 'none' !== this.current() && ! store.get( this.current() ) ) {
				this.library.props.set( PROP, null );
			}

			this.renderActive();

			if ( this.$el.find( '.fmm-form__input' ).length ) {
				this.$el.find( '.fmm-form__input' ).trigger( 'focus' ).trigger( 'select' );
			} else if ( focusKey ) {
				this.focusKey( focusKey );
			}
		},

		renderActive: function() {
			var current = this.current();

			this.$el.find( '.fmm-sidebar__item' ).each( function() {
				var $item = $( this );
				var active = String( $item.data( 'folder' ) ) === current;
				$item.toggleClass( 'is-active', active );
				$item.find( '.fmm-folder' ).attr( 'aria-current', active ? 'true' : null );
			} );
		},

		/**
		 * Restores focus after re-rendering; falls back to the folder button.
		 *
		 * @param {string} key data-fmm-key of the element.
		 */
		focusKey: function( key ) {
			var $target = this.$el.find( '[data-fmm-key="' + key + '"]' );
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
			this.editing = id;
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

		remove: function( id ) {
			var self = this;
			var folder = store.get( id );
			var message;

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
			if ( ! window.confirm( message ) ) {
				return;
			}

			this.busy = true;
			wp.apiFetch( { path: '/fmm/v1/folders/' + id, method: 'DELETE' } ).then( function() {
				self.busy = false;
				if ( self.current() === String( id ) ) {
					self.library.props.set( PROP, null );
				}
				/* translators: %s: folder name. */
				self.notice( sprintf( __( 'Folder “%s” deleted.', 'fena-media-manager' ), folder.name ), 'success' );
				return store.refresh().then( function() {
					self.focusKey( 'folder-' );
				} );
			} ).catch( function( error ) {
				self.fail( error );
			} );
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
		var sidebar;

		if ( ! frame || ! frame.$el || ! frame.state || ! frame.state().get( 'library' ) ) {
			return;
		}

		if ( fmm.bindUploader ) {
			fmm.bindUploader( frame.uploader );
		}

		sidebar = new Sidebar( frame );
		frame.$el.wrap( '<div class="fmm-layout"></div>' );
		frame.$el.parent().prepend( sidebar.$el );

		// The grid computes its columns from the container width.
		$( window ).trigger( 'resize' );
	} );
}( jQuery, _, window.wp ) );
