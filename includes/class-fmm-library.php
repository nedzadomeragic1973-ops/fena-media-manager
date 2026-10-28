<?php
/**
 * Media library integration: assets, folder summary and the AJAX query filter.
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Loads the folder UI wherever the media modal is loaded and applies the
 * folder filter to media library queries.
 */
class FMM_Library {

	/**
	 * Registers the hooks.
	 */
	public static function init() {
		add_action( 'wp_enqueue_media', array( __CLASS__, 'enqueue_media' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_upload_screen' ) );
		add_filter( 'ajax_query_attachments_args', array( __CLASS__, 'filter_ajax_query' ) );
		add_action( 'add_attachment', array( __CLASS__, 'assign_upload' ) );
	}

	/**
	 * Media uploader (async-upload.php, action upload-attachment): assigns the
	 * new attachment to the folder that was active when the upload started.
	 * The uploader sends it as `fmm_folder` ('none' for "Unassigned", which
	 * stays unassigned); when it sends nothing ("All Media"), the default
	 * upload folder setting applies. REST uploads, sideloads, media-new.php
	 * and programmatic inserts are not affected.
	 *
	 * @param int $attachment_id New attachment ID.
	 */
	public static function assign_upload( $attachment_id ) {
		if ( ! wp_doing_ajax() || ! isset( $_POST['action'] ) || 'upload-attachment' !== $_POST['action'] || ! check_ajax_referer( 'media-form', false, false ) ) {
			return;
		}

		if ( isset( $_POST['fmm_folder'] ) ) {
			$folder     = sanitize_text_field( wp_unslash( $_POST['fmm_folder'] ) );
			$folder_ids = ctype_digit( $folder ) ? FMM_Taxonomy::filter_folder_ids( array( (int) $folder ) ) : array();
		} else {
			$default    = (int) FMM_Settings::get( 'upload_folder' );
			$folder_ids = $default ? array( $default ) : array();
		}

		if ( $folder_ids && FMM_Taxonomy::can_assign( $attachment_id ) ) {
			wp_set_object_terms( (int) $attachment_id, $folder_ids, FMM_Taxonomy::NAME, true );
		}
	}

	/**
	 * Asset version for cache busting. Released builds use the plugin
	 * version (bump FMM_VERSION with every release); local and development
	 * environments or SCRIPT_DEBUG append the file modification time, so
	 * edited files are reloaded while unchanged ones stay cached.
	 *
	 * @param string $file Path relative to the plugin directory.
	 * @return string
	 */
	public static function asset_version( $file ) {
		$dev = in_array( wp_get_environment_type(), array( 'local', 'development' ), true ) || ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG );

		if ( $dev && file_exists( FMM_PATH . $file ) ) {
			return FMM_VERSION . '.' . filemtime( FMM_PATH . $file );
		}

		return FMM_VERSION;
	}

	/**
	 * Registers the shared design token stylesheet (dependency of the
	 * plugin styles; every token is scoped to the .fmm class).
	 */
	public static function register_tokens() {
		if ( ! wp_style_is( 'fmm-tokens', 'registered' ) ) {
			wp_register_style( 'fmm-tokens', FMM_URL . 'assets/css/fmm-tokens.css', array(), self::asset_version( 'assets/css/fmm-tokens.css' ) );
		}
	}

	/**
	 * Enqueues the folder store and the modal folder filter. Runs inside
	 * wp_enqueue_media(), so it covers the media library, the Customizer,
	 * the block editor and every meta box that opens the media modal.
	 */
	public static function enqueue_media() {
		if ( ! FMM_Taxonomy::can_read() || wp_script_is( 'fmm-media-filter', 'enqueued' ) ) {
			return;
		}

		self::register_tokens();
		wp_enqueue_style( 'fmm-media', FMM_URL . 'assets/css/fmm-media.css', array( 'fmm-tokens' ), self::asset_version( 'assets/css/fmm-media.css' ) );
		wp_enqueue_script(
			'fmm-media-filter',
			FMM_URL . 'assets/js/fmm-media-filter.js',
			array( 'jquery', 'underscore', 'backbone', 'media-views', 'wp-api-fetch', 'wp-i18n', 'wp-a11y' ),
			self::asset_version( 'assets/js/fmm-media-filter.js' ),
			true
		);
		wp_set_script_translations( 'fmm-media-filter', 'fena-media-manager', FMM_PATH . 'languages' );
		wp_localize_script(
			'fmm-media-filter',
			'fmmMediaSettings',
			array_merge(
				self::get_summary(),
				array(
					'canManage'    => FMM_Taxonomy::can_manage(),
					'treeExpanded' => (bool) FMM_Settings::get( 'tree_expanded' ),
					'restoreLast'  => (bool) FMM_Settings::get( 'restore_last_folder' ),
					'storageKey'   => 'fmm-last-folder-' . get_current_blog_id() . '-' . get_current_user_id(),
				)
			)
		);
	}

	/**
	 * Enqueues the folder sidebar on the media library screen. The script
	 * only activates when the grid view fires `wp-media-grid-ready`.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public static function enqueue_upload_screen( $hook_suffix ) {
		// The folder store is only registered once wp_enqueue_media() ran (grid mode); the list view has no sidebar.
		if ( 'upload.php' !== $hook_suffix || ! FMM_Taxonomy::can_read() || ! wp_script_is( 'fmm-media-filter', 'registered' ) ) {
			return;
		}

		self::register_tokens();
		wp_enqueue_style( 'fmm-media', FMM_URL . 'assets/css/fmm-media.css', array( 'fmm-tokens' ), self::asset_version( 'assets/css/fmm-media.css' ) );
		wp_enqueue_script(
			'fmm-folder-sidebar',
			FMM_URL . 'assets/js/fmm-folder-sidebar.js',
			array( 'fmm-media-filter' ),
			self::asset_version( 'assets/js/fmm-folder-sidebar.js' ),
			true
		);
		wp_set_script_translations( 'fmm-folder-sidebar', 'fena-media-manager', FMM_PATH . 'languages' );
		add_action( 'admin_footer', array( 'FMM_Icons', 'print_sprite' ) );
	}

	/**
	 * Folders (in the sort mode of the current user) plus the "All Media" and "Unassigned" counts.
	 *
	 * @return array
	 */
	public static function get_summary() {
		return array(
			'folders'    => FMM_Taxonomy::get_folders(),
			'sort'       => FMM_Taxonomy::sort_mode(),
			'total'      => self::count_attachments(),
			'unassigned' => self::count_attachments( array( self::tax_clause( 'none' ) ) ),
		);
	}

	/**
	 * Counts library attachments with the same status rules as the media
	 * library query (wp_ajax_query_attachments).
	 *
	 * @param array $tax_query Optional tax query.
	 * @return int
	 */
	private static function count_attachments( $tax_query = array() ) {
		$status = 'inherit';
		if ( current_user_can( get_post_type_object( 'attachment' )->cap->read_private_posts ) ) {
			$status .= ',private';
		}

		$query = new WP_Query(
			array(
				'post_type'              => 'attachment',
				'post_status'            => $status,
				'posts_per_page'         => 1,
				'fields'                 => 'ids',
				'tax_query'              => $tax_query, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- Indexed term relationship lookup.
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			)
		);

		return (int) $query->found_posts;
	}

	/**
	 * Builds the tax query clause for a folder filter value.
	 *
	 * @param mixed $value '' / null = all media, 'none' = unassigned, ID = folder.
	 * @return array|null
	 */
	public static function tax_clause( $value ) {
		$value = is_scalar( $value ) ? (string) $value : '';

		if ( 'none' === $value ) {
			return array(
				'taxonomy' => FMM_Taxonomy::NAME,
				'operator' => 'NOT EXISTS',
			);
		}

		if ( ctype_digit( $value ) && (int) $value > 0 ) {
			return array(
				'taxonomy'         => FMM_Taxonomy::NAME,
				'field'            => 'term_id',
				'terms'            => array( (int) $value ),
				'include_children' => false,
			);
		}

		return null;
	}

	/**
	 * Adds a folder clause to existing query args (keeps other tax queries).
	 *
	 * @param array      $tax_query Existing tax query.
	 * @param array|null $clause    Folder clause.
	 * @return array
	 */
	public static function merge_tax_query( $tax_query, $clause ) {
		$tax_query = is_array( $tax_query ) ? $tax_query : array();
		if ( $clause ) {
			$tax_query[] = $clause;
			if ( ! isset( $tax_query['relation'] ) ) {
				$tax_query['relation'] = 'AND';
			}
		}
		return $tax_query;
	}

	/**
	 * Media grid / media modal: core whitelists the taxonomy query var; it is
	 * replaced by an explicit term_id clause because the query var expects slugs.
	 *
	 * @param array $query Query args.
	 * @return array
	 */
	public static function filter_ajax_query( $query ) {
		if ( ! array_key_exists( FMM_Taxonomy::NAME, $query ) ) {
			return $query;
		}

		$clause = self::tax_clause( $query[ FMM_Taxonomy::NAME ] );
		unset( $query[ FMM_Taxonomy::NAME ] );

		if ( $clause ) {
			$query['tax_query'] = self::merge_tax_query( isset( $query['tax_query'] ) ? $query['tax_query'] : array(), $clause ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- Folder filter.
		}

		return $query;
	}
}
