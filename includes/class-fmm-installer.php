<?php
/**
 * One-time creation of the default folders.
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Seeds the editable example folders exactly once per site.
 */
class FMM_Installer {

	/**
	 * Option that marks the defaults as created. Never deleted by the plugin,
	 * so deleted default folders do not come back after updates or reactivation.
	 */
	const OPTION = 'fmm_defaults_seeded';

	/**
	 * Creates the default folders on the first admin request after activation.
	 */
	public static function maybe_seed() {
		if ( false !== get_option( self::OPTION ) || ! taxonomy_exists( FMM_Taxonomy::NAME ) ) {
			return;
		}

		$existing = (int) wp_count_terms(
			array(
				'taxonomy'   => FMM_Taxonomy::NAME,
				'hide_empty' => false,
			)
		);

		// add_option() fails when the row exists, so it doubles as a lock
		// against two concurrent requests seeding at the same time.
		if ( ! add_option( self::OPTION, FMM_VERSION, '', 'yes' ) || $existing > 0 ) {
			return;
		}

		$defaults = array(
			__( 'Hero Images', 'fena-media-manager' ),
			__( 'Hero Slider', 'fena-media-manager' ),
			__( 'Blog Images', 'fena-media-manager' ),
			__( 'Backgrounds', 'fena-media-manager' ),
			__( 'Logos & Icons', 'fena-media-manager' ),
			__( 'Videos', 'fena-media-manager' ),
		);

		foreach ( (array) apply_filters( 'fmm_default_folders', $defaults ) as $name ) {
			$name = FMM_Taxonomy::sanitize_name( $name );
			if ( true === FMM_Taxonomy::validate_name( $name ) ) {
				wp_insert_term( $name, FMM_Taxonomy::NAME );
			}
		}
	}
}
