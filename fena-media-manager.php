<?php
/**
 * Plugin Name: Fena Media Manager
 * Description: Virtual folders for the WordPress media library.
 * Version: 1.0.0
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Text Domain: fena-media-manager
 * Domain Path: /languages
 * License: GPL-2.0-or-later
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

define( 'FMM_VERSION', '1.0.0' );
define( 'FMM_FILE', __FILE__ );
define( 'FMM_PATH', plugin_dir_path( FMM_FILE ) );
define( 'FMM_URL', plugin_dir_url( FMM_FILE ) );

require_once FMM_PATH . 'includes/class-fmm-plugin.php';
require_once FMM_PATH . 'includes/class-fmm-taxonomy.php';
require_once FMM_PATH . 'includes/class-fmm-settings.php';
require_once FMM_PATH . 'includes/class-fmm-installer.php';
require_once FMM_PATH . 'includes/class-fmm-rest.php';
require_once FMM_PATH . 'includes/class-fmm-attachment-fields.php';
require_once FMM_PATH . 'includes/class-fmm-library.php';
require_once FMM_PATH . 'includes/class-fmm-list-mode.php';

add_action( 'plugins_loaded', array( 'FMM_Plugin', 'init' ) );
