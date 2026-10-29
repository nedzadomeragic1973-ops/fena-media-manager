/**
 * Fena Media Manager: upload progress panel of the media library grid (upload.php).
 *
 * Listen-only: it follows the events of `wp.Uploader.queue` and `wp.Uploader.errors`
 * (core wp-plupload.js) and shows the progress; it never uploads, retries or sends
 * a request itself.
 *
 * @package Fena_Media_Manager
 */

( function( $, _, wp ) {
	'use strict';

	if ( ! wp || ! wp.i18n ) {
		return;
	}

	var __ = wp.i18n.__;
	var _n = wp.i18n._n;
	var sprintf = wp.i18n.sprintf;
	var SVG_NS = 'http://www.w3.org/2000/svg';
	var LIST_ID = 'fmm-upload-list';
	var started = false;

	function iconEl( href ) {
		var svg = document.createElementNS( SVG_NS, 'svg' );
		var use = document.createElementNS( SVG_NS, 'use' );

		svg.setAttribute( 'class', 'fmm-icon' );
		svg.setAttribute( 'aria-hidden', 'true' );
		svg.setAttribute( 'focusable', 'false' );
		use.setAttribute( 'href', '#' + href );
		svg.appendChild( use );

		return svg;
	}

	function formatNumber( value, digits ) {
		var lang = document.documentElement.lang || undefined;

		try {
			return new Intl.NumberFormat( lang, { minimumFractionDigits: digits, maximumFractionDigits: digits } ).format( value );
		} catch ( e ) {
			return value.toFixed( digits );
		}
	}

	// 1024-based, units B / KB / MB / GB, two decimals above bytes.
	function formatBytes( bytes ) {
		var units = [ 'B', 'KB', 'MB', 'GB' ];
		var i = 0;

		while ( bytes >= 1024 && i < units.length - 1 ) {
			bytes /= 1024;
			i++;
		}

		return formatNumber( bytes, i ? 2 : 0 ) + ' ' + units[ i ];
	}

	function init() {
		var queue = wp.Uploader.queue;
		var errors = wp.Uploader.errors;
		var entries = {};
		var order = [];
		var pendingNotes = {};
		var panel = null;
		var collapsed = false;
		var frame = 0;
		var spoken = '';
		var announced = false;
		var doneTimer = 0;

		function entryList() {
			return _.map( order, function( id ) {
				return entries[ id ];
			} );
		}

		function finished() {
			return order.length > 0 && _.every( entryList(), function( entry ) {
				return 'done' === entry.state || 'error' === entry.state;
			} );
		}

		function speak( message, politeness ) {
			if ( wp.a11y && wp.a11y.speak ) {
				wp.a11y.speak( message, politeness || 'polite' );
			}
		}

		function reset() {
			entries = {};
			order = [];
			pendingNotes = {};
			collapsed = false;
			spoken = '';
			announced = false;
			clearTimeout( doneTimer );
			doneTimer = 0;
		}

		// A new upload after a completed session starts a fresh one.
		function begin() {
			// "Completed" means the panel showed the finished state; files queued in the same tick still belong to the session.
			if ( finished() && 'done' === spoken ) {
				reset();
			}
		}

		function closePanel() {
			if ( panel ) {
				panel.remove();
				panel = null;
			}
			reset();
		}

		function totals() {
			var list = entryList();
			var t = { total: list.length, done: 0, failed: 0, loaded: 0, size: 0 };

			_.each( list, function( entry ) {
				if ( 'done' === entry.state ) {
					t.done++;
				}
				if ( 'error' === entry.state ) {
					t.failed++;
					return;
				}
				t.size += entry.size;
				t.loaded += 'uploading' === entry.state ? Math.min( entry.loaded, entry.size ) : entry.size;
			} );
			t.percent = t.size > 0 ? Math.floor( t.loaded / t.size * 100 ) : null;

			return t;
		}

		function title( t, isDone ) {
			var percent = null === t.percent ? 0 : t.percent;

			if ( ! isDone ) {
				return sprintf(
					/* translators: 1: current file number, 2: number of files, 3: overall percentage. */
					_n( 'Uploading %1$d of %2$d file – %3$d %%', 'Uploading %1$d of %2$d files – %3$d %%', t.total, 'fena-media-manager' ),
					Math.min( t.done + t.failed + 1, t.total ), t.total, percent
				);
			}
			if ( t.failed ) {
				return sprintf(
					/* translators: 1: number of uploaded files, 2: number of files, 3: number of failed files. */
					_n( '%1$d of %2$d file uploaded, %3$d failed', '%1$d of %2$d files uploaded, %3$d failed', t.total, 'fena-media-manager' ),
					t.done, t.total, t.failed
				);
			}

			return sprintf(
				/* translators: 1: number of uploaded files, 2: number of files. */
				_n( '%1$d/%2$d file uploaded – 100 %%', '%1$d/%2$d files uploaded – 100 %%', t.total, 'fena-media-manager' ),
				t.done, t.total
			);
		}

		function buildPanel() {
			panel = $( '<section class="fmm fmm-upload" role="region"></section>' ).attr( 'aria-label', __( 'Upload progress', 'fena-media-manager' ) ).append(
				$( '<div class="fmm-upload__header"></div>' ).append(
					$( '<span class="fmm-upload__status-icon"></span>' ),
					$( '<div class="fmm-upload__heading"></div>' ).append(
						$( '<p class="fmm-upload__title"></p>' ),
						$( '<p class="fmm-upload__subtitle"></p>' )
					),
					$( '<button type="button" class="fmm-upload__toggle"></button>' ).attr( 'aria-controls', LIST_ID ).on( 'click', function() {
						collapsed = ! collapsed;
						render();
					} ),
					$( '<button type="button" class="fmm-upload__close"></button>' ).attr( { 'aria-label': __( 'Close', 'fena-media-manager' ), title: __( 'Close', 'fena-media-manager' ) } ).append( iconEl( 'fmm-i-x-mark' ) ).on( 'click', closePanel )
				),
				$( '<ul class="fmm-upload__list"></ul>' ).attr( 'id', LIST_ID )
			).appendTo( document.body );
		}

		function fileIcon( entry ) {
			return /^image\//.test( entry.type ) || /\.(jpe?g|png|gif|webp|avif|heic|bmp|svg|ico)$/i.test( entry.name ) ? 'fmm-i-photo' : 'fmm-g-document';
		}

		function renderRow( entry ) {
			var $row = panel.find( '.fmm-upload__item[data-id="' + entry.id + '"]' );
			var $bar, status, statusClass, full;

			if ( ! $row.length ) {
				$row = $( '<li class="fmm-upload__item"></li>' ).attr( 'data-id', entry.id ).append(
					$( '<div class="fmm-upload__row"></div>' ).append(
						$( '<span class="fmm-upload__file-icon"></span>' ).append( iconEl( fileIcon( entry ) ) ),
						$( '<span class="fmm-upload__name"></span>' ).text( entry.name ).attr( 'title', entry.name ),
						$( '<span class="fmm-upload__size"></span>' ),
						$( '<span class="fmm-upload__state"></span>' )
					),
					$( '<div class="fmm-upload__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="fmm-upload__fill"></span></div>' ).attr( 'aria-label', entry.name ),
					$( '<p class="fmm-upload__message"></p>' )
				).appendTo( panel.find( '.fmm-upload__list' ) );
			}

			status = { uploading: Math.min( entry.percent, 100 ) + ' %', processing: __( 'Processing…', 'fena-media-manager' ), done: __( 'Completed', 'fena-media-manager' ), error: __( 'Failed', 'fena-media-manager' ) }[ entry.state ];
			full = 'processing' === entry.state || 'done' === entry.state;
			statusClass = 'is-' + entry.state;
			$bar = $row.find( '.fmm-upload__bar' );

			$row.attr( 'data-state', entry.state );
			$row.find( '.fmm-upload__size' ).text( entry.size ? formatBytes( entry.size ) : '' );
			$row.find( '.fmm-upload__state' ).attr( 'class', 'fmm-upload__state ' + statusClass ).text( status );
			$bar.prop( 'hidden', 'error' === entry.state ).find( '.fmm-upload__fill' ).css( 'width', ( full ? 100 : Math.min( entry.percent, 100 ) ) + '%' );
			if ( 'processing' === entry.state ) {
				$bar.removeAttr( 'aria-valuenow' ).attr( 'aria-valuetext', __( 'Processing…', 'fena-media-manager' ) );
			} else {
				$bar.removeAttr( 'aria-valuetext' ).attr( 'aria-valuenow', full ? 100 : Math.min( entry.percent, 100 ) );
			}
			$row.find( '.fmm-upload__message' ).toggleClass( 'is-error', 'error' === entry.state ).text( entry.message || entry.note || '' ).prop( 'hidden', ! ( entry.message || entry.note ) );
		}

		function render() {
			var t = totals();
			var isDone = finished();
			var iconName = ! isDone ? 'fmm-i-arrow-up-tray' : ( t.failed ? 'fmm-i-exclamation-circle' : 'fmm-i-check' );
			var label;

			frame = 0;
			if ( ! order.length ) {
				return;
			}
			if ( ! panel ) {
				buildPanel();
			}
			if ( ! announced ) {
				announced = true;
				speak( sprintf(
					/* translators: %d: number of files. */
					_n( 'Uploading %d file.', 'Uploading %d files.', order.length, 'fena-media-manager' ), order.length
				) );
			}

			panel.attr( 'data-state', ! isDone ? 'uploading' : ( t.failed ? 'error' : 'done' ) ).toggleClass( 'is-collapsed', collapsed && ! isDone );
			panel.find( '.fmm-upload__status-icon' ).empty().append( iconEl( iconName ) );
			panel.find( '.fmm-upload__title' ).text( title( t, isDone ) );
			panel.find( '.fmm-upload__subtitle' ).text( null === t.percent || ! t.size ? '' : sprintf(
				/* translators: 1: transferred size, 2: total size, e.g. "988.19 KB". */
				__( '%1$s of %2$s', 'fena-media-manager' ), formatBytes( t.loaded ), formatBytes( t.size )
			) ).prop( 'hidden', null === t.percent || ! t.size );

			label = collapsed ? __( 'Expand upload list', 'fena-media-manager' ) : __( 'Collapse upload list', 'fena-media-manager' );
			panel.find( '.fmm-upload__toggle' ).prop( 'hidden', isDone ).attr( { 'aria-expanded': String( ! collapsed ), 'aria-label': label, title: label } ).empty().append( iconEl( collapsed ? 'fmm-i-chevron-up' : 'fmm-i-chevron-down' ) );
			panel.find( '.fmm-upload__close' ).prop( 'hidden', ! isDone );
			panel.find( '.fmm-upload__list' ).prop( 'hidden', collapsed && ! isDone );

			_.each( entryList(), renderRow );

			// Announced (and the session closed for new files) shortly after the last file, so a batch whose rejected files arrive first stays one session.
			if ( isDone && 'done' !== spoken && ! doneTimer ) {
				doneTimer = setTimeout( function() {
					doneTimer = 0;
					if ( finished() ) {
						spoken = 'done';
						speak( title( totals(), true ) );
					}
				}, 800 );
			}
		}

		function schedule() {
			if ( ! frame ) {
				frame = window.requestAnimationFrame ? window.requestAnimationFrame( render ) : setTimeout( render, 16 );
			}
		}

		function add( id, props ) {
			if ( entries[ id ] ) {
				return entries[ id ];
			}
			begin();
			entries[ id ] = _.extend( { id: id, name: '', size: 0, type: '', loaded: 0, percent: 0, state: 'uploading', message: '', note: '' }, props );
			order.push( id );
			if ( pendingNotes[ id ] ) {
				entries[ id ].note = pendingNotes[ id ];
				delete pendingNotes[ id ];
			}

			return entries[ id ];
		}

		function inQueue( id ) {
			return queue.some( function( model ) {
				var file = model.get( 'file' );
				return model.fmmId === id || ( file && file.id === id );
			} );
		}

		queue.on( 'add', function( model ) {
			var file = model.get( 'file' ) || {};
			var id = file.id || model.cid;

			model.fmmId = id;
			add( id, { name: model.get( 'filename' ) || file.name || '', size: model.get( 'size' ) || file.size || 0, type: file.type || '' } );
			schedule();
		} );

		queue.on( 'change:percent change:loaded', function( model ) {
			var entry = entries[ model.fmmId ];
			var percent = model.get( 'percent' );

			if ( ! entry || 'uploading' !== entry.state || ! model.get( 'uploading' ) ) {
				return;
			}
			if ( _.isNumber( model.get( 'loaded' ) ) ) {
				entry.loaded = model.get( 'loaded' );
			}
			if ( _.isNumber( percent ) ) {
				entry.percent = percent;
				if ( percent >= 100 ) {
					entry.state = 'processing';
				}
			}
			schedule();
		} );

		queue.on( 'change:uploading', function( model ) {
			var entry = entries[ model.fmmId ];

			if ( entry && ! model.get( 'uploading' ) && 'error' !== entry.state ) {
				entry.state = 'done';
				entry.loaded = entry.size;
				entry.percent = 100;
				schedule();
			}
		} );

		errors.on( 'add', function( error ) {
			var file = error.get( 'file' ) || {};
			var message = error.get( 'message' ) || '';
			var id = file.id;
			var entry = entries[ id ];

			if ( ! id ) {
				return;
			}
			if ( entry && inQueue( id ) ) {
				entry.note = message;
			} else if ( entry ) {
				entry.state = 'error';
				entry.message = message;
			} else if ( 'image/heic' !== file.type || message !== ( window.pluploadL10n || {} ).unsupported_image ) {
				entry = add( id, { name: file.name || '', size: file.size || 0, type: file.type || '' } );
				entry.state = 'error';
				entry.message = message;
			} else {
				// HEIC warning raised before the file is queued (the upload continues): shown as a note once its row exists.
				pendingNotes[ id ] = message;
				return;
			}
			if ( 'error' === entry.state ) {
				speak( sprintf(
					/* translators: 1: file name, 2: error message. */
					__( 'Upload failed: %1$s. %2$s', 'fena-media-manager' ), entry.name, message
				), 'assertive' );
			}
			schedule();
		} );

		// Reset events (core empties the queue when everything finished) are ignored on purpose.
	}

	$( document ).on( 'wp-media-grid-ready', function() {
		if ( started || ! wp.Uploader || ! wp.Uploader.queue || ! wp.Uploader.errors ) {
			return;
		}
		started = true;
		init();
	} );
}( jQuery, window._, window.wp ) );
