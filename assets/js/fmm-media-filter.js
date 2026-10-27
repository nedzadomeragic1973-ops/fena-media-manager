/**
 * Fena Media Manager: shared folder store and the folder filter of the media modal.
 *
 * This file is the only place that extends core Backbone media views. Every
 * extension point is feature-detected; when core changes, the filter simply
 * does not appear and all server-side features keep working.
 *
 * Filter values of the `fmm_folder` query prop:
 *   null       All media (prop is not sent to the server)
 *   'none'     Media without folder
 *   '<id>'     Media in the folder with this term ID (always a string)
 *
 * @package Fena_Media_Manager
 */

( function( $, _, Backbone, wp, settings ) {
	'use strict';

	var media = wp && wp.media;

	if ( ! settings || ! media || ! media.view || ! media.view.AttachmentsBrowser || ! media.view.AttachmentFilters || ! media.view.Label || ! wp.apiFetch ) {
		return;
	}

	var __ = wp.i18n.__;
	var PROP = 'fmm_folder';

	/**
	 * Folder list and counts shared by the modal filter and the sidebar.
	 */
	var store = _.extend( {
		folders: [],
		total: 0,
		unassigned: 0,
		sort: settings.sort || 'name_asc',
		treeExpanded: !! settings.treeExpanded,
		restoreLast: !! settings.restoreLast,
		storageKey: settings.storageKey || '',
		canManage: !! settings.canManage,

		set: function( summary ) {
			this.folders = summary.folders || [];
			this.total = parseInt( summary.total, 10 ) || 0;
			this.unassigned = parseInt( summary.unassigned, 10 ) || 0;
			if ( summary.sort ) {
				this.sort = summary.sort;
			}
			this.trigger( 'change' );
		},

		get: function( id ) {
			return _.find( this.folders, function( folder ) {
				return String( folder.id ) === String( id );
			} );
		},

		/**
		 * Folders in tree order (depth first, siblings in the user's sort mode,
		 * as sorted by the server; never re-sorted here). Folders whose parent is missing are shown at the top level.
		 *
		 * @return {Object[]} { folder, depth, parents: [ids], hasChildren }.
		 */
		tree: function() {
			var self = this;
			var children = _.groupBy( this.folders, function( folder ) {
				return folder.parent && self.get( folder.parent ) ? String( folder.parent ) : '0';
			} );
			var list = [];

			( function walk( parentId, depth, parents ) {
				_.each( children[ parentId ] || [], function( folder ) {
					var id = String( folder.id );
					// Guards against parent cycles in corrupted data.
					if ( _.contains( parents, id ) ) {
						return;
					}
					list.push( { folder: folder, depth: depth, parents: parents, hasChildren: !! children[ id ] } );
					walk( id, depth + 1, parents.concat( id ) );
				} );
			}( '0', 0, [] ) );

			return list;
		},

		/**
		 * Saves the folder sort mode of the current user.
		 *
		 * @param {string} mode Sort mode.
		 * @return {Promise} Resolves with the summary.
		 */
		setSort: function( mode ) {
			return wp.apiFetch( { path: '/fmm/v1/preferences', method: 'POST', data: { sort: mode } } ).then( function( summary ) {
				store.set( summary );
				return summary;
			} );
		},

		/**
		 * Stores the manual order of the folders below a parent.
		 *
		 * @param {string|number} parentId Parent folder ID, 0 for the top level.
		 * @param {Array}         ids      Folder IDs in the new order.
		 * @return {Promise} Resolves with the summary.
		 */
		reorder: function( parentId, ids ) {
			return wp.apiFetch( { path: '/fmm/v1/folders/order', method: 'POST', data: { parent: Number( parentId ) || 0, ids: _.map( ids, Number ) } } ).then( function( summary ) {
				store.set( summary );
				return summary;
			} );
		},

		refresh: function() {
			return wp.apiFetch( { path: '/fmm/v1/summary' } ).then( function( summary ) {
				store.set( summary );
				return summary;
			} );
		}
	}, Backbone.Events );

	store.set( settings );
	store.refreshSoon = _.debounce( function() {
		store.refresh().catch( function() {} );
	}, 400 );

	// Counts change when folders are edited in the attachment details, when
	// media is deleted and after uploads.
	if ( media.model && media.model.Attachments && media.model.Attachments.all ) {
		store.listenTo( media.model.Attachments.all, 'change:fmmFolders destroy', store.refreshSoon );
	}
	if ( wp.Uploader && wp.Uploader.queue ) {
		store.listenTo( wp.Uploader.queue, 'reset', store.refreshSoon );
	}

	/**
	 * Option label with media count.
	 *
	 * @param {string} name  Folder name.
	 * @param {number} count Media count.
	 * @return {string} Label.
	 */
	function countLabel( name, count ) {
		return name + ' (' + count + ')';
	}

	/**
	 * Folder dropdown. Options are built with .text() (folder names are user input).
	 */
	var FolderFilter = media.view.AttachmentFilters.extend( {
		id: 'fmm-attachment-folder-filter',
		className: 'attachment-filters fmm-folder-filter',

		initialize: function() {
			this.listenTo( this.model, 'change', this.select );
			this.listenTo( store, 'change', this.rebuild );
			this.rebuild();
		},

		createFilters: function() {
			var filters = {
				all: { text: __( 'All folders', 'fena-media-manager' ), props: { fmm_folder: null }, priority: 10 },
				none: { text: countLabel( __( 'Unassigned', 'fena-media-manager' ), store.unassigned ), props: { fmm_folder: 'none' }, priority: 20 }
			};

			_.each( store.tree(), function( node, index ) {
				var folder = node.folder;
				filters[ 'folder-' + folder.id ] = {
					text: new Array( node.depth + 1 ).join( '— ' ) + countLabel( folder.name, folder.count ),
					props: { fmm_folder: String( folder.id ) },
					priority: 30 + index
				};
			} );

			this.filters = filters;
		},

		rebuild: function() {
			var current = this.model.get( PROP );

			this.createFilters();
			this.$el.empty().append( _.chain( this.filters ).map( function( filter, value ) {
				return {
					el: $( '<option></option>' ).val( value ).text( filter.text )[ 0 ],
					priority: filter.priority
				};
			} ).sortBy( 'priority' ).pluck( 'el' ).value() );

			// The active folder was deleted: fall back to all media.
			if ( current && 'none' !== current && ! store.get( current ) ) {
				this.model.set( PROP, null );
			}

			this.select();
		}
	} );

	/**
	 * Whether an attachment belongs to a folder filter value. Uploads in
	 * progress use the folder they are being uploaded to (stamped by the
	 * uploader binding below); finished ones their saved `fmmFolders`.
	 *
	 * @param {wp.media.model.Attachment} attachment Attachment.
	 * @param {string}                    value      'none' or folder ID.
	 * @return {boolean} Match.
	 */
	function inFolder( attachment, value ) {
		var file = attachment.get( 'file' );
		var target = attachment.fmmUploadFolder;
		var folders;

		if ( attachment.get( 'uploading' ) ) {
			if ( undefined === target ) {
				target = ( file && file.fmmFolder ) || '';
			}
			folders = target && 'none' !== target ? [ target ] : [];
		} else {
			folders = _.map( attachment.get( 'fmmFolders' ) || [], String );
		}

		return 'none' === value ? ! folders.length : _.contains( folders, value );
	}

	/*
	 * Folder queries validate their items client-side with inFolder(). Core
	 * queries watch `wp.Uploader.queue` so new uploads appear at once, but
	 * only when every query arg is one that can be validated client-side
	 * (same allow-list as core plus the folder prop). Folder changes of
	 * loaded media (sidebar, drag and drop, attachment details) update the
	 * query at once; when other args cannot be checked client-side, media
	 * is only removed, never added.
	 */
	if ( media.model && media.model.Query && media.model.Attachments && media.model.Attachments.all ) {
		var originalQueryInitialize = media.model.Query.prototype.initialize;
		var originalValidator = media.model.Attachments.prototype.validator;

		/*
		 * Libraries that mirror a query do not apply client-side filters, so
		 * media leaving the folder would stay visible; they validate the
		 * folder of their props the same way as the query.
		 */
		media.model.Attachments.prototype.validator = function( attachment ) {
			var folder = this.props && this.props.get( 'query' ) ? this.props.get( PROP ) : null;

			if ( null !== folder && undefined !== folder && '' !== folder && ! inFolder( attachment, String( folder ) ) ) {
				return false;
			}
			return originalValidator.apply( this, arguments );
		};
		var observable = [ 's', 'order', 'orderby', 'posts_per_page', 'post_mime_type', 'post_parent', 'author', PROP ];

		media.model.Query.prototype.initialize = function() {
			var value, canValidate;

			originalQueryInitialize.apply( this, arguments );

			value = this.args && this.args[ PROP ];
			if ( null === value || undefined === value || '' === value ) {
				return;
			}

			value = String( value );
			canValidate = _.isEmpty( _.difference( _.keys( this.args ), observable ) );

			this.filters.fmmFolder = function( attachment ) {
				return inFolder( attachment, value );
			};

			if ( canValidate && wp.Uploader && wp.Uploader.queue ) {
				this.observe( wp.Uploader.queue );
			}

			this.listenTo( media.model.Attachments.all, 'change:fmmFolders', function( attachment ) {
				if ( canValidate ) {
					this.validate( attachment );
				} else if ( this.get( attachment.cid ) && ! inFolder( attachment, value ) ) {
					this.remove( attachment );
				}
			} );
		};
	}

	/**
	 * The folder an uploader uploads into: the folder filter of the frame's
	 * current library. '' for all media (the server then applies the default
	 * upload folder), 'none' for unassigned.
	 *
	 * @param {wp.media.view.Frame} frame Media frame.
	 * @return {string} Folder ID, 'none' or ''.
	 */
	function uploadFolder( frame ) {
		var state = frame && frame.state && frame.state();
		var library = state && state.get && state.get( 'library' );
		var value = library && library.props && library.props.get( 'query' ) ? library.props.get( PROP ) : null;

		value = ( null === value || undefined === value ) ? '' : String( value );
		return /^\d+$/.test( value ) || 'none' === value ? value : '';
	}

	/**
	 * Sends the active folder with each upload. The folder is captured per
	 * file when it is added (before core creates its placeholder model and
	 * starts the queue), so changing the folder during a running upload does
	 * not redirect files that are already queued.
	 *
	 * @param {wp.media.view.UploaderWindow} view Uploader view.
	 */
	function bindUploader( view ) {
		var up = view && view.uploader && view.uploader.uploader;

		if ( ! up || ! up.bind || up.fmmBound ) {
			return;
		}
		up.fmmBound = true;

		up.bind( 'FilesAdded', function( uploader, files ) {
			var folder = uploadFolder( view.controller );
			_.each( files, function( file ) {
				file.fmmFolder = folder;
			} );
		}, null, 100 );

		up.bind( 'FilesAdded', function( uploader, files ) {
			_.each( files, function( file ) {
				if ( file.attachment ) {
					file.attachment.fmmUploadFolder = file.fmmFolder || '';
				}
			} );
		} );

		up.bind( 'BeforeUpload', function( uploader, file ) {
			if ( file.fmmFolder ) {
				uploader.settings.multipart_params[ PROP ] = file.fmmFolder;
			} else {
				delete uploader.settings.multipart_params[ PROP ];
			}
		}, null, 100 );
	}

	if ( media.view.UploaderWindow ) {
		var originalUploaderReady = media.view.UploaderWindow.prototype.ready;

		media.view.UploaderWindow.prototype.ready = function() {
			var result = originalUploaderReady.apply( this, arguments );
			bindUploader( this );
			return result;
		};
	}

	var originalCreateToolbar = media.view.AttachmentsBrowser.prototype.createToolbar;

	/**
	 * Adds the folder filter after the core filters. The media library grid
	 * uses the folder sidebar instead; collections that are not library
	 * queries (e.g. gallery editing) get no filter.
	 */
	media.view.AttachmentsBrowser.prototype.createToolbar = function() {
		originalCreateToolbar.apply( this, arguments );

		var props = this.collection && this.collection.props;

		if ( ! this.toolbar || ! props || ! props.get( 'query' ) || this.controller.isModeActive( 'grid' ) ) {
			return;
		}

		this.toolbar.set( 'fmmFolderFilterLabel', new media.view.Label( {
			value: __( 'Filter by folder', 'fena-media-manager' ),
			attributes: { 'for': 'fmm-attachment-folder-filter' },
			priority: -70
		} ).render() );

		this.toolbar.set( 'fmmFolderFilter', new FolderFilter( {
			controller: this.controller,
			model: props,
			priority: -70
		} ).render() );
	};

	window.fmmMedia = {
		store: store,
		prop: PROP,
		FolderFilter: FolderFilter,
		bindUploader: bindUploader
	};
}( jQuery, _, Backbone, window.wp, window.fmmMediaSettings ) );
