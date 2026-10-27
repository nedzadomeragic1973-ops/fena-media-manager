/**
 * Fena Media Manager: settings page. Switches the import preview between the
 * merge and skip statuses. Without JavaScript the merge statuses stay visible.
 *
 * @package Fena_Media_Manager
 */

( function() {
	'use strict';

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
