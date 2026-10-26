<?php
/**
 * Folder filter for the media library list view.
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Adds a folder dropdown to upload.php?mode=list and applies it to the main query.
 */
class FMM_List_Mode {

	/**
	 * Sanitized filter value of the current request ('' = all).
	 *
	 * @var string
	 */
	private static $current = '';

	/**
	 * Registers the hooks.
	 */
	public static function init() {
		add_action( 'pre_get_posts', array( __CLASS__, 'filter_main_query' ) );
		add_action( 'restrict_manage_posts', array( __CLASS__, 'render_dropdown' ), 10, 2 );
		add_filter( 'bulk_actions-upload', array( __CLASS__, 'bulk_actions' ) );
		add_filter( 'handle_bulk_actions-upload', array( __CLASS__, 'handle_bulk_action' ), 10, 3 );
		add_action( 'admin_notices', array( __CLASS__, 'bulk_notice' ) );
		add_filter( 'removable_query_args', array( __CLASS__, 'removable_query_args' ) );
	}

	/**
	 * Adds "Add to folder" / "Remove from folder" option groups to the
	 * native bulk actions dropdown.
	 *
	 * @param array $actions Bulk actions.
	 * @return array
	 */
	public static function bulk_actions( $actions ) {
		$folders = FMM_Taxonomy::get_folder_tree();
		if ( empty( $folders ) || ! FMM_Taxonomy::can_assign_any() ) {
			return $actions;
		}

		// Core prints bulk action labels unescaped, so they are escaped here.
		$add    = array();
		$remove = array();
		foreach ( $folders as $folder ) {
			$add[ 'fmm_add_' . $folder['id'] ]       = esc_html( FMM_Taxonomy::tree_label( $folder ) );
			$remove[ 'fmm_remove_' . $folder['id'] ] = esc_html( FMM_Taxonomy::tree_label( $folder ) );
		}

		$actions[ __( 'Add to folder', 'fena-media-manager' ) ]      = $add;
		$actions[ __( 'Remove from folder', 'fena-media-manager' ) ] = $remove;

		return $actions;
	}

	/**
	 * Handles the folder bulk actions. Core has already verified the
	 * bulk-media nonce; every attachment is checked with can_assign().
	 *
	 * @param string $sendback Redirect URL.
	 * @param string $action   Bulk action.
	 * @param int[]  $post_ids Selected attachment IDs.
	 * @return string
	 */
	public static function handle_bulk_action( $sendback, $action, $post_ids ) {
		if ( ! preg_match( '/^fmm_(add|remove)_(\d+)$/', (string) $action, $matches ) ) {
			return $sendback;
		}

		$folder = FMM_Taxonomy::get_folder( (int) $matches[2] );
		if ( ! $folder || ! FMM_Taxonomy::can_assign_any() ) {
			return add_query_arg( 'fmm_bulk_error', 1, $sendback );
		}

		$result = FMM_Taxonomy::assign( $post_ids, array( (int) $folder->term_id ), 'add' === $matches[1] );

		return add_query_arg(
			array(
				'fmm_bulk'    => $matches[1],
				'fmm_target'  => (int) $folder->term_id,
				'fmm_updated' => count( $result['updated'] ),
				'fmm_skipped' => count( $result['skipped'] ),
			),
			$sendback
		);
	}

	/**
	 * Result notice after a folder bulk action (display only, no state change).
	 */
	public static function bulk_notice() {
		global $pagenow;

		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- Read-only result message after a nonce-checked redirect.
		if ( 'upload.php' !== $pagenow || ( ! isset( $_GET['fmm_bulk'] ) && ! isset( $_GET['fmm_bulk_error'] ) ) ) {
			return;
		}

		if ( isset( $_GET['fmm_bulk_error'] ) ) {
			wp_admin_notice( __( 'The folder could not be found.', 'fena-media-manager' ), array( 'type' => 'error' ) );
			return;
		}

		$folder  = FMM_Taxonomy::get_folder( isset( $_GET['fmm_target'] ) ? absint( $_GET['fmm_target'] ) : 0 );
		$name    = $folder ? wp_specialchars_decode( $folder->name, ENT_QUOTES ) : '';
		$updated = isset( $_GET['fmm_updated'] ) ? absint( $_GET['fmm_updated'] ) : 0;
		$skipped = isset( $_GET['fmm_skipped'] ) ? absint( $_GET['fmm_skipped'] ) : 0;
		$add     = 'add' === sanitize_key( wp_unslash( $_GET['fmm_bulk'] ) );
		// phpcs:enable

		$message = $add
			/* translators: 1: number of media files, 2: folder name. */
			? sprintf( _n( '%1$d media file added to “%2$s”.', '%1$d media files added to “%2$s”.', $updated, 'fena-media-manager' ), $updated, $name )
			/* translators: 1: number of media files, 2: folder name. */
			: sprintf( _n( '%1$d media file removed from “%2$s”.', '%1$d media files removed from “%2$s”.', $updated, 'fena-media-manager' ), $updated, $name );

		if ( $skipped ) {
			/* translators: %d: number of media files. */
			$message .= ' ' . sprintf( _n( '%d media file could not be changed (missing permission).', '%d media files could not be changed (missing permission).', $skipped, 'fena-media-manager' ), $skipped );
		}

		wp_admin_notice(
			esc_html( $message ),
			array(
				'type'        => $skipped ? 'warning' : 'success',
				'dismissible' => true,
			)
		);
	}

	/**
	 * Removes the result parameters from the URL after display.
	 *
	 * @param string[] $args Removable query args.
	 * @return string[]
	 */
	public static function removable_query_args( $args ) {
		return array_merge( $args, array( 'fmm_bulk', 'fmm_bulk_error', 'fmm_target', 'fmm_updated', 'fmm_skipped' ) );
	}

	/**
	 * Replaces the slug-based query var with a term_id clause on the media list screen.
	 *
	 * @param WP_Query $query Query.
	 */
	public static function filter_main_query( $query ) {
		global $pagenow;

		if ( ! is_admin() || ! $query->is_main_query() || 'upload.php' !== $pagenow ) {
			return;
		}

		$value = $query->get( FMM_Taxonomy::NAME );
		if ( '' === $value || null === $value ) {
			return;
		}

		$clause = FMM_Library::tax_clause( $value );
		$query->set( FMM_Taxonomy::NAME, '' );

		if ( $clause ) {
			self::$current = (string) $value;
			$query->set( 'tax_query', FMM_Library::merge_tax_query( $query->get( 'tax_query' ), $clause ) );
		}
	}

	/**
	 * Renders the folder dropdown next to the date filter.
	 *
	 * @param string $post_type Post type of the list table.
	 */
	public static function render_dropdown( $post_type ) {
		if ( 'attachment' !== $post_type || ! FMM_Taxonomy::can_read() ) {
			return;
		}

		$summary = FMM_Library::get_summary();
		?>
		<label for="fmm-folder-filter" class="screen-reader-text"><?php esc_html_e( 'Filter by folder', 'fena-media-manager' ); ?></label>
		<select name="<?php echo esc_attr( FMM_Taxonomy::NAME ); ?>" id="fmm-folder-filter">
			<option value=""><?php esc_html_e( 'All folders', 'fena-media-manager' ); ?></option>
			<option value="none" <?php selected( self::$current, 'none' ); ?>>
				<?php
				/* translators: %d: number of media items. */
				echo esc_html( sprintf( __( 'Unassigned (%d)', 'fena-media-manager' ), $summary['unassigned'] ) );
				?>
			</option>
			<?php foreach ( FMM_Taxonomy::get_folder_tree() as $folder ) : ?>
				<option class="level-<?php echo (int) $folder['depth']; ?>" value="<?php echo esc_attr( $folder['id'] ); ?>" <?php selected( self::$current, (string) $folder['id'] ); ?>>
					<?php echo esc_html( sprintf( '%s (%d)', FMM_Taxonomy::tree_label( $folder ), $folder['count'] ) ); ?>
				</option>
			<?php endforeach; ?>
		</select>
		<?php
	}
}
