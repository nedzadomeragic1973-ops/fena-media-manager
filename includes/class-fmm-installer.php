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
	 * Claims the seed marker. INSERT IGNORE succeeds for exactly one request.
	 *
	 * @return bool Whether this request created the marker.
	 */
	private static function claim() {
		global $wpdb;

		$autoload = function_exists( 'wp_determine_option_autoload_value' ) ? wp_determine_option_autoload_value( self::OPTION, FMM_VERSION, FMM_VERSION, 'yes' ) : 'yes';
		$result   = $wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, %s)", self::OPTION, FMM_VERSION, $autoload ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic claim.

		wp_cache_delete( self::OPTION, 'options' );
		wp_cache_delete( 'notoptions', 'options' );
		wp_cache_delete( 'alloptions', 'options' );

		return 1 === $result;
	}

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

		// The marker doubles as a lock against concurrent requests. add_option()
		// is not enough: its upsert reports success for the losing request too
		// when the database client uses FOUND_ROWS, so the claim is atomic here.
		if ( ! self::claim() || $existing > 0 ) {
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
