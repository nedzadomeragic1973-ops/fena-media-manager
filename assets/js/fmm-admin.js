/**
 * Fena Media Manager: settings page. Replaces the select fields with the Fena
 * dropdown (the native select stays in the form and keeps the value) and
 * switches the import preview between the merge and skip statuses. Without
 * JavaScript the native selects and the merge statuses stay visible.
 *
 * @package Fena_Media_Manager
 */

( function() {
	'use strict';

	function enhance( select ) {
		var picker, label, labelId, button, described, stack;
		var options = [];

		if ( ! select || ! window.fmmPicker || ! window.jQuery ) {
			return;
		}

		stack = [];
		Array.prototype.forEach.call( select.options, function( option ) {
			var folder = option.hasAttribute( 'data-name' );
			var depth = folder ? parseInt( option.getAttribute( 'data-depth' ), 10 ) || 0 : 0;
			var name = folder ? option.getAttribute( 'data-name' ) : option.textContent.trim();
			var item = { value: option.value, label: name, depth: depth };

			if ( folder ) {
				stack[ depth ] = name;
				item.icon = option.getAttribute( 'data-icon' ) || '';
				item.color = option.getAttribute( 'data-color' ) || '';
				item.path = stack.slice( 0, depth ).join( ' › ' );
			}
			options.push( item );
		} );

		label = document.querySelector( 'label[for="' + select.id + '"]' );
		labelId = label ? ( label.id || ( label.id = select.id + '-label' ) ) : '';
		picker = window.fmmPicker.create( {
			id: select.id + '-picker',
			labelId: labelId,
			listId: select.id + '-listbox',
			options: options,
			value: select.value,
			onChange: function( value ) {
				select.value = value;
				select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			}
		} );

		select.hidden = true;
		select.parentNode.insertBefore( picker.$el[ 0 ], select.nextSibling );
		button = picker.$el[ 0 ].querySelector( '.fmm-picker__button' );
		if ( label ) {
			label.setAttribute( 'for', button.id );
			label.addEventListener( 'click', function( event ) {
				event.preventDefault();
				picker.focus();
			} );
		}
		described = select.getAttribute( 'aria-describedby' );
		if ( described ) {
			button.setAttribute( 'aria-describedby', described );
			select.removeAttribute( 'aria-describedby' );
		}
	}

	enhance( document.getElementById( 'fmm-default-sort' ) );
	enhance( document.getElementById( 'fmm-upload-folder' ) );

	// Success notices get the same card as the folder sidebar (see fmm-components.css).
	function svgIcon( id ) {
		var ns = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS( ns, 'svg' );
		var use = document.createElementNS( ns, 'use' );

		svg.setAttribute( 'class', 'fmm-icon' );
		svg.setAttribute( 'aria-hidden', 'true' );
		svg.setAttribute( 'focusable', 'false' );
		use.setAttribute( 'href', '#fmm-i-' + id );
		svg.appendChild( use );

		return svg;
	}

	function enhanceNotices() {
		Array.prototype.forEach.call( document.querySelectorAll( '.fmm-settings .notice-success' ), function( notice ) {
			var icon, dismiss;

			if ( notice.classList.contains( 'fmm-notice-ui' ) ) {
				return;
			}
			notice.classList.add( 'fmm-notice-ui' );
			icon = document.createElement( 'span' );
			icon.className = 'fmm-notice-ui__icon';
			icon.setAttribute( 'aria-hidden', 'true' );
			icon.appendChild( svgIcon( 'check' ) );
			notice.insertBefore( icon, notice.firstChild );
			dismiss = notice.querySelector( '.notice-dismiss' );
			if ( dismiss ) {
				dismiss.insertBefore( svgIcon( 'x-mark' ), dismiss.firstChild );
			}
		} );
	}

	// After core common.js has added the dismiss buttons.
	window.jQuery( function() {
		window.setTimeout( enhanceNotices, 0 );
	} );

	var preview = document.querySelector( '.fmm-preview' );

	if ( ! preview ) {
		return;
	}

	function update() {
		var checked = preview.querySelector( 'input[name="fmm_strategy"]:checked' );
		var strategy = checked ? checked.value : 'merge';

		preview.setAttribute( 'data-strategy', strategy );
		Array.prototype.forEach.call( preview.querySelectorAll( '.fmm-badge[data-view]' ), function( badge ) {
			badge.hidden = badge.getAttribute( 'data-view' ) !== strategy;
		} );
		Array.prototype.forEach.call( preview.querySelectorAll( '.fmm-preview__summary' ), function( summary, index ) {
			summary.classList.toggle( 'is-selected', ( 0 === index ? 'merge' : 'skip' ) === strategy );
		} );
	}

	Array.prototype.forEach.call( preview.querySelectorAll( 'input[name="fmm_strategy"]' ), function( radio ) {
		radio.addEventListener( 'change', update );
	} );

	update();
}() );
