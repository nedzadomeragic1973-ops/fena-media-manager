<?php
/**
 * Plugin bootstrap.
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Wires all plugin hooks.
 */
class FMM_Plugin {

	/**
	 * Registers the plugin hooks.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'on_init' ), 5 );
		add_action( 'admin_init', array( 'FMM_Installer', 'maybe_seed' ) );
		add_action( 'rest_api_init', array( 'FMM_REST', 'register_routes' ) );
		add_action( 'set_object_terms', array( 'FMM_Taxonomy', 'restrict_to_attachments' ), 10, 4 );
		FMM_Attachment_Fields::init();
		FMM_Library::init();
		FMM_List_Mode::init();
		FMM_Settings::init();
	}

	/**
	 * Loads translations and registers the folder taxonomy.
	 */
	public static function on_init() {
		load_plugin_textdomain( 'fena-media-manager', false, dirname( plugin_basename( FMM_FILE ) ) . '/languages' );
		FMM_Taxonomy::register();
	}
}
