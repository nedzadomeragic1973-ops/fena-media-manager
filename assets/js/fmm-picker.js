/**
 * Fena Media Manager: dropdown following the WAI-ARIA "select-only combobox"
 * pattern. Used by the move dialog of the folder sidebar and the settings page.
 *
 * @package Fena_Media_Manager
 */

( function( $, _, wp ) {
	'use strict';

	if ( ! wp || ! wp.i18n ) {
		return;
	}

	var __ = wp.i18n.__;
	var sprintf = wp.i18n.sprintf;
	var SVG_NS = 'http://www.w3.org/2000/svg';
	var ICON_IDS = { check: 'check', expanded: 'chevron-down', folder: 'folder' };
	var FOLDER_ICONS = [ 'image', 'video', 'document', 'audio', 'archive', 'star', 'people', 'tag' ];
	var COLOR_PRESETS = [ 'blue', 'violet', 'sand', 'green' ];
	var COLOR_HEX = /^#[0-9a-f]{6}$/i;

	function svgEl( className, href ) {
		var svg = document.createElementNS( SVG_NS, 'svg' );
		var use = document.createElementNS( SVG_NS, 'use' );

		svg.setAttribute( 'class', className );
		svg.setAttribute( 'aria-hidden', 'true' );
		svg.setAttribute( 'focusable', 'false' );
		use.setAttribute( 'href', '#' + href );
		svg.appendChild( use );

		return svg;
	}

	function iconEl( name ) {
		return svgEl( 'fmm-icon fmm-icon--' + name, 'fmm-i-' + ICON_IDS[ name ] );
	}

	// Folder icon, plus the glyph of the folder icon next to it when it has one.
	function folderIconEls( key ) {
		var els = [ iconEl( 'folder' ) ];

		if ( _.contains( FOLDER_ICONS, key ) ) {
			els.push( svgEl( 'fmm-icon fmm-folder__glyph', 'fmm-g-' + key ) );
		}

		return els;
	}

	// Case and accent insensitive text with a map back to the original indexes.
	function fold( value ) {
		var text = '';
		var map = [];
		var i, j, part;

		for ( i = 0; i < value.length; i++ ) {
			part = value.charAt( i ).toLocaleLowerCase();
			if ( part.normalize ) {
				part = part.normalize( 'NFD' ).replace( /[\u0300-\u036f]/g, '' );
			}
			for ( j = 0; j < part.length; j++ ) {
				map.push( i );
			}
			text += part;
		}

		return { text: text, map: map };
	}

	/**
	 * Builds a dropdown.
	 *
	 * @param {Object}   config
	 * @param {string}   config.id        Combobox id.
	 * @param {string}   config.labelId   Id of the label element.
	 * @param {string}   config.listId    Listbox id.
	 * @param {Object[]} config.options   { value, label, depth, color, icon, plain, path }; no icon key = no icon.
	 * @param {string}   config.value     Initially selected value.
	 * @param {Function} [config.onChange] Called with the value after the user chose another one.
	 * @return {Object} { $el, value(), focus() }.
	 */
	function create( config ) {

		var options = config.options;
		var value = config.value;
		var active = 0;
		var typed = '';
		var typedTimer = 0;
		var isOpen = false;
		var $wrap = $( '<div class="fmm-picker"></div>' );
		var $button = $( '<button type="button" class="fmm-picker__button" role="combobox" aria-haspopup="listbox" aria-expanded="false"></button>' )
			.attr( { id: config.id, 'aria-controls': config.listId, 'aria-labelledby': config.labelId + ' ' + config.id } );
		var $buttonIcon = $( '<span class="fmm-picker__icon" aria-hidden="true"></span>' );
		var $buttonLabel = $( '<span class="fmm-picker__label"></span>' );
		var $list = $( '<ul class="fmm-picker__list" role="listbox" tabindex="-1" hidden></ul>' ).attr( { id: config.listId, 'aria-labelledby': config.labelId } );
		var $items = [];

		function markColor( $el, color ) {
			$el.attr( 'data-fmm-color', null );
			$el[ 0 ].style.removeProperty( '--fmm-folder-color' );
			if ( _.contains( COLOR_PRESETS, color ) ) {
				$el.attr( 'data-fmm-color', color );
			} else if ( COLOR_HEX.test( color || '' ) ) {
				$el[ 0 ].style.setProperty( '--fmm-folder-color', color );
			}
		}

		function indexOfValue( v ) {
			return _.findIndex( options, function( option ) {
				return option.value === v;
			} );
		}

		function syncButton() {
			var option = options[ indexOfValue( value ) ];

			$buttonIcon.empty().prop( 'hidden', undefined === option.icon ).toggleClass( 'fmm-picker__icon--plain', !! option.plain );
			if ( undefined !== option.icon ) {
				$buttonIcon.append( folderIconEls( option.icon ) );
			}
			markColor( $buttonIcon, option.color );
			$buttonLabel.text( option.label );
			$button.attr( 'data-value', option.value );
			$items.forEach( function( $li, i ) {
				$li.attr( 'aria-selected', String( options[ i ].value === value ) );
			} );
		}

		function setActive( index ) {
			var li;

			active = Math.max( 0, Math.min( options.length - 1, index ) );
			$items.forEach( function( $li, i ) {
				$li.toggleClass( 'is-active', i === active );
			} );
			li = $items[ active ][ 0 ];
			$button.attr( 'aria-activedescendant', li.id );
			if ( li.offsetTop < $list[ 0 ].scrollTop ) {
				$list[ 0 ].scrollTop = li.offsetTop - 4;
			} else if ( li.offsetTop + li.offsetHeight > $list[ 0 ].scrollTop + $list[ 0 ].clientHeight ) {
				$list[ 0 ].scrollTop = li.offsetTop + li.offsetHeight - $list[ 0 ].clientHeight + 4;
			}
		}

		function onOutside( event ) {
			if ( ! $( event.target ).closest( $wrap ).length ) {
				close();
			}
		}

		function open( index ) {
			var rect = $button[ 0 ].getBoundingClientRect();
			var below = window.innerHeight - rect.bottom - 22;
			var above = rect.top - 22;
			var up = below < 160 && above > below;

			isOpen = true;
			$button.attr( 'aria-expanded', 'true' );
			$wrap.addClass( 'is-open' ).toggleClass( 'is-up', up );
			$list.prop( 'hidden', false ).css( 'max-height', Math.max( 96, Math.min( 280, up ? above : below ) ) + 'px' );
			setActive( undefined === index ? indexOfValue( value ) : index );
			document.addEventListener( 'mousedown', onOutside, true );
		}

		function close() {
			isOpen = false;
			$button.attr( 'aria-expanded', 'false' ).removeAttr( 'aria-activedescendant' );
			$wrap.removeClass( 'is-open is-up' );
			$list.prop( 'hidden', true );
			document.removeEventListener( 'mousedown', onOutside, true );
		}

		function choose( index ) {
			var changed = value !== options[ index ].value;

			value = options[ index ].value;
			syncButton();
			close();
			if ( changed && config.onChange ) {
				config.onChange( value );
			}
		}

		function typeAhead( char ) {
			var start = active;
			var i, n, text;

			typed += fold( char ).text;
			clearTimeout( typedTimer );
			typedTimer = setTimeout( function() {
				typed = '';
			}, 500 );
			if ( 1 === typed.length || _.uniq( typed.split( '' ) ).length === 1 ) {
				start = active + 1;
				text = typed.charAt( 0 );
			} else {
				text = typed;
			}
			for ( n = 0; n < options.length; n++ ) {
				i = ( start + n ) % options.length;
				if ( 0 === fold( options[ i ].label ).text.indexOf( text ) ) {
					return i;
				}
			}
			return -1;
		}

		_.each( options, function( option, i ) {
			var $icon = undefined === option.icon ? null : $( '<span class="fmm-picker__icon" aria-hidden="true"></span>' ).append( folderIconEls( option.icon ) ).toggleClass( 'fmm-picker__icon--plain', !! option.plain );
			var $li = $( '<li class="fmm-picker__option" role="option"></li>' ).attr( { id: config.listId + '-opt-' + option.value, 'data-value': option.value, 'aria-selected': 'false' } )
				.css( 'padding-inline-start', ( 10 + ( option.depth || 0 ) * 16 ) + 'px' )
				.append( $icon, $( '<span class="fmm-picker__name"></span>' ).text( option.label ), iconEl( 'check' ) );

			if ( $icon ) {
				markColor( $icon, option.color );
			}
			if ( option.path ) {
				/* translators: %s: parent folder path, e.g. "Campaigns › 2025". */
				$li.find( '.fmm-picker__name' ).after( $( '<span class="screen-reader-text"></span>' ).text( ', ' + sprintf( __( 'in %s', 'fena-media-manager' ), option.path ) ) );
			}
			$li.on( 'mousedown', function( event ) {
				event.preventDefault();
			} ).on( 'click', function() {
				choose( i );
				$button.trigger( 'focus' );
			} );
			$items.push( $li );
			$list.append( $li );
		} );

		$button.append( $buttonIcon, $buttonLabel, iconEl( 'expanded' ) ).on( 'click', function() {
			if ( isOpen ) {
				close();
			} else {
				open();
			}
		} ).on( 'keydown', function( event ) {
			var key = event.key;
			var printable = 1 === key.length && ' ' !== key && ! event.ctrlKey && ! event.metaKey && ! event.altKey;
			var found;

			if ( ! isOpen ) {
				if ( 'Enter' === key || ' ' === key || 'ArrowDown' === key || 'ArrowUp' === key ) {
					event.preventDefault();
					open();
				} else if ( 'Home' === key || 'End' === key ) {
					event.preventDefault();
					open( 'Home' === key ? 0 : options.length - 1 );
				} else if ( printable ) {
					event.preventDefault();
					found = typeAhead( key );
					open( found < 0 ? undefined : found );
				}
				return;
			}

			if ( 'Escape' === key ) {
				event.preventDefault();
				event.stopPropagation();
				close();
			} else if ( 'Tab' === key ) {
				choose( active );
			} else if ( 'Enter' === key || ' ' === key || ( event.altKey && 'ArrowUp' === key ) ) {
				event.preventDefault();
				choose( active );
			} else if ( 'ArrowDown' === key ) {
				event.preventDefault();
				setActive( active + 1 );
			} else if ( 'ArrowUp' === key ) {
				event.preventDefault();
				setActive( active - 1 );
			} else if ( 'Home' === key ) {
				event.preventDefault();
				setActive( 0 );
			} else if ( 'End' === key ) {
				event.preventDefault();
				setActive( options.length - 1 );
			} else if ( 'PageDown' === key ) {
				event.preventDefault();
				setActive( active + 10 );
			} else if ( 'PageUp' === key ) {
				event.preventDefault();
				setActive( active - 10 );
			} else if ( printable ) {
				event.preventDefault();
				found = typeAhead( key );
				if ( found >= 0 ) {
					setActive( found );
				}
			}
		} );

		$wrap.append( $button, $list );
		syncButton();

		return {
			$el: $wrap,
			value: function() {
				return value;
			},
			focus: function() {
				$button.trigger( 'focus' );
			}
		};
	}

	window.fmmPicker = { create: create, fold: fold };
}( jQuery, window._, window.wp ) );
