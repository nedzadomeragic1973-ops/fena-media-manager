<?php
/**
 * Settings page (Media > Fena Media Manager).
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Plugin settings stored in one option; every read is re-validated.
 */
class FMM_Settings {

	/**
	 * Option name (also the settings group).
	 */
	const OPTION = 'fmm_settings';

	/**
	 * Settings page slug.
	 */
	const PAGE = 'fmm-settings';

	/**
	 * Hook suffix of the settings page.
	 *
	 * @var string
	 */
	private static $page_hook = '';

	/**
	 * Registers the hooks.
	 */
	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_menu', array( __CLASS__, 'add_page' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( FMM_FILE ), array( __CLASS__, 'action_links' ) );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'row_meta' ), 10, 2 );
	}

	/**
	 * Default settings.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'default_sort'        => 'name_asc',
			'tree_expanded'       => false,
			'restore_last_folder' => false,
			'upload_folder'       => 0,
		);
	}

	/**
	 * A validated setting value. Stored values are never trusted.
	 *
	 * @param string $key Setting key.
	 * @return mixed
	 */
	public static function get( $key ) {
		$settings = self::normalize( get_option( self::OPTION, array() ), self::defaults() );

		return isset( $settings['values'][ $key ] ) ? $settings['values'][ $key ] : null;
	}

	/**
	 * Sanitizes the submitted settings (register_setting callback).
	 *
	 * @param mixed $input Submitted value.
	 * @return array Only the known settings.
	 */
	public static function sanitize( $input ) {
		$previous = self::normalize( get_option( self::OPTION, array() ), self::defaults() );

		if ( ! is_array( $input ) ) {
			return $previous['values'];
		}

		$result = self::normalize( $input, self::defaults() );
		// The first save runs this callback twice (update_option() falls back to add_option()).
		if ( $result['invalid_folder'] && ! in_array( 'fmm_invalid_upload_folder', wp_list_pluck( get_settings_errors( self::OPTION ), 'code' ), true ) ) {
			add_settings_error( self::OPTION, 'fmm_invalid_upload_folder', __( 'The selected upload folder does not exist.', 'fena-media-manager' ) );
		}

		return $result['values'];
	}

	/**
	 * Validates settings against the defaults.
	 *
	 * @param mixed $input    Raw settings.
	 * @param array $defaults Defaults.
	 * @return array { values: array, invalid_folder: bool }
	 */
	private static function normalize( $input, $defaults ) {
		$input   = is_array( $input ) ? $input : array();
		$values  = $defaults;
		$invalid = false;

		if ( isset( $input['default_sort'] ) && is_string( $input['default_sort'] ) && in_array( $input['default_sort'], FMM_Taxonomy::SORT_MODES, true ) ) {
			$values['default_sort'] = $input['default_sort'];
		}

		$values['tree_expanded']       = ! empty( $input['tree_expanded'] );
		$values['restore_last_folder'] = ! empty( $input['restore_last_folder'] );

		$folder = isset( $input['upload_folder'] ) && is_scalar( $input['upload_folder'] ) ? absint( $input['upload_folder'] ) : 0;
		if ( $folder && FMM_Taxonomy::get_folder( $folder ) ) {
			$values['upload_folder'] = $folder;
		} elseif ( $folder ) {
			$invalid = true;
		}

		return array(
			'values'         => $values,
			'invalid_folder' => $invalid,
		);
	}

	/**
	 * Registers the setting.
	 */
	public static function register() {
		register_setting(
			self::OPTION,
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'default'           => self::defaults(),
				'show_in_rest'      => false,
			)
		);
	}

	/**
	 * Adds the page below Media.
	 */
	public static function add_page() {
		$hook = add_submenu_page(
			'upload.php',
			__( 'Fena Media Manager', 'fena-media-manager' ),
			__( 'Fena Media Manager', 'fena-media-manager' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render' )
		);

		self::$page_hook = (string) $hook;
	}

	/**
	 * Loads the page styles on the settings page only.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public static function enqueue( $hook_suffix ) {
		if ( '' === self::$page_hook || self::$page_hook !== $hook_suffix ) {
			return;
		}

		FMM_Library::register_picker();
		wp_enqueue_style( 'fmm-admin', FMM_URL . 'assets/css/fmm-admin.css', array( 'fmm-tokens', 'fmm-components' ), FMM_Library::asset_version( 'assets/css/fmm-admin.css' ) );
		wp_enqueue_script( 'fmm-admin', FMM_URL . 'assets/js/fmm-admin.js', array( 'jquery', 'fmm-picker' ), FMM_Library::asset_version( 'assets/js/fmm-admin.js' ), true );
		add_action( 'admin_footer', array( 'FMM_Icons', 'print_sprite' ) );
	}

	/**
	 * Adds the "Settings" link on the plugins screen.
	 *
	 * @param string[] $links Action links.
	 * @return string[]
	 */
	public static function action_links( $links ) {
		if ( current_user_can( 'manage_options' ) ) {
			array_unshift(
				$links,
				sprintf( '<a href="%s">%s</a>', esc_url( admin_url( 'upload.php?page=' . self::PAGE ) ), esc_html__( 'Settings', 'fena-media-manager' ) )
			);
		}

		return $links;
	}

	/**
	 * Adds the "Support" e-mail link below the plugin description on the plugins screen.
	 *
	 * @param string[] $meta Row meta links.
	 * @param string   $file Plugin file relative to the plugins directory.
	 * @return string[]
	 */
	public static function row_meta( $meta, $file ) {
		if ( plugin_basename( FMM_FILE ) === $file ) {
			$meta[] = sprintf( '<a href="%s">%s</a>', esc_url( 'mailto:omeragicnedzad@icloud.com' ), esc_html__( 'Support', 'fena-media-manager' ) );
		}

		return $meta;
	}

	/**
	 * Validated donation link: a https://paypal.me/<name> URL from the
	 * `fmm_donate_url` filter, otherwise ''.
	 *
	 * @return string URL or ''.
	 */
	public static function donate_url() {
		$url = apply_filters( 'fmm_donate_url', 'https://www.paypal.me/nedzadomeragic' );

		if ( ! is_string( $url ) || '' === $url || ! wp_http_validate_url( $url ) ) {
			return '';
		}

		$parts = wp_parse_url( $url );
		$host  = isset( $parts['host'] ) ? strtolower( $parts['host'] ) : '';
		$path  = isset( $parts['path'] ) ? trim( $parts['path'], '/' ) : '';

		if ( ! isset( $parts['scheme'] ) || 'https' !== strtolower( $parts['scheme'] ) || ! in_array( $host, array( 'paypal.me', 'www.paypal.me' ), true ) || '' === $path ) {
			return '';
		}

		return $url;
	}

	/**
	 * Renders the donation card. Outside the settings form; no URL = disabled button.
	 */
	private static function render_donate_card() {
		$url = self::donate_url();
		?>
		<section class="fmm-card fmm-donate" aria-labelledby="fmm-settings-donate">
			<h2 id="fmm-settings-donate">
				<svg class="fmm-icon fmm-donate__heading-icon" aria-hidden="true" focusable="false"><use href="#fmm-i-heart"></use></svg>
				<?php esc_html_e( 'Support Fena Media Manager', 'fena-media-manager' ); ?>
			</h2>
			<p><?php esc_html_e( 'Fena Media Manager is free to use. If you enjoy the plugin, you can support its continued development with a voluntary donation.', 'fena-media-manager' ); ?></p>
			<div class="fmm-donate__row">
				<?php if ( '' !== $url ) : ?>
					<a class="button button-primary fmm-donate__button" href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener noreferrer">
						<svg class="fmm-icon" aria-hidden="true" focusable="false"><use href="#fmm-i-heart"></use></svg>
						<span><?php esc_html_e( 'Donate via PayPal', 'fena-media-manager' ); ?><span class="screen-reader-text"> <?php esc_html_e( '(opens in a new tab)', 'fena-media-manager' ); ?></span></span>
						<svg class="fmm-icon fmm-donate__external" aria-hidden="true" focusable="false"><use href="#fmm-i-arrow-top-right-on-square"></use></svg>
					</a>
				<?php else : ?>
					<button type="button" class="fmm-donate__button" disabled aria-disabled="true">
						<svg class="fmm-icon" aria-hidden="true" focusable="false"><use href="#fmm-i-heart"></use></svg>
						<span><?php esc_html_e( 'Donate via PayPal', 'fena-media-manager' ); ?></span>
						<svg class="fmm-icon fmm-donate__external" aria-hidden="true" focusable="false"><use href="#fmm-i-arrow-top-right-on-square"></use></svg>
					</button>
				<?php endif; ?>
				<span class="fmm-donate__note"><?php esc_html_e( 'Optional support. All features remain free.', 'fena-media-manager' ); ?></span>
			</div>
		</section>
		<?php
	}

	/**
	 * Sort mode labels (same as the folder sidebar).
	 *
	 * @return string[]
	 */
	private static function sort_labels() {
		return array(
			'name_asc'  => __( 'Name (A–Z)', 'fena-media-manager' ),
			'name_desc' => __( 'Name (Z–A)', 'fena-media-manager' ),
			'newest'    => __( 'Newest first', 'fena-media-manager' ),
			'oldest'    => __( 'Oldest first', 'fena-media-manager' ),
			'manual'    => __( 'Manual order', 'fena-media-manager' ),
		);
	}

	/**
	 * Renders the settings page.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$sort      = self::get( 'default_sort' );
		$expanded  = (bool) self::get( 'tree_expanded' );
		$restore   = (bool) self::get( 'restore_last_folder' );
		$upload_to = (int) self::get( 'upload_folder' );
		$name      = self::OPTION;
		?>
		<div class="wrap fmm fmm-settings">
			<div class="fmm-card fmm-hero">
				<img class="fmm-hero__image" src="<?php echo esc_url( add_query_arg( 'ver', FMM_Library::asset_version( 'assets/img/ffm-folder-header.svg' ), FMM_URL . 'assets/img/ffm-folder-header.svg' ) ); ?>" width="42" height="28" alt="" decoding="async">
				<h1 class="fmm-hero__title"><?php esc_html_e( 'Fena Media Manager', 'fena-media-manager' ); ?></h1>
			</div>
			<?php // Core moves admin notices below this marker instead of into the header card. ?>
			<hr class="wp-header-end">
			<?php settings_errors(); ?>
			<form method="post" action="options.php">
				<?php settings_fields( self::OPTION ); ?>
				<section class="fmm-card" aria-labelledby="fmm-settings-general">
					<h2 id="fmm-settings-general"><?php esc_html_e( 'Folders', 'fena-media-manager' ); ?></h2>

					<div class="fmm-field">
						<div class="fmm-field__label">
							<label for="fmm-default-sort"><?php esc_html_e( 'Default sort order', 'fena-media-manager' ); ?></label>
						</div>
						<div class="fmm-field__control">
							<select id="fmm-default-sort" name="<?php echo esc_attr( $name ); ?>[default_sort]" aria-describedby="fmm-default-sort-help">
								<?php foreach ( self::sort_labels() as $mode => $label ) : ?>
									<option value="<?php echo esc_attr( $mode ); ?>"<?php selected( $sort, $mode ); ?>><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
							<p class="fmm-field__help" id="fmm-default-sort-help"><?php esc_html_e( 'Used for users who have not chosen a sort order in the folder sidebar.', 'fena-media-manager' ); ?></p>
						</div>
					</div>

					<fieldset class="fmm-field">
						<legend class="fmm-field__label"><?php esc_html_e( 'Folder tree on load', 'fena-media-manager' ); ?></legend>
						<div class="fmm-field__control">
							<label class="fmm-choice">
								<input type="radio" name="<?php echo esc_attr( $name ); ?>[tree_expanded]" value="" aria-describedby="fmm-tree-help"<?php checked( ! $expanded ); ?> />
								<?php esc_html_e( 'Collapsed', 'fena-media-manager' ); ?>
							</label>
							<label class="fmm-choice">
								<input type="radio" name="<?php echo esc_attr( $name ); ?>[tree_expanded]" value="1" aria-describedby="fmm-tree-help"<?php checked( $expanded ); ?> />
								<?php esc_html_e( 'Expanded', 'fena-media-manager' ); ?>
							</label>
							<p class="fmm-field__help" id="fmm-tree-help"><?php esc_html_e( 'Applies to the folder sidebar in the media library grid.', 'fena-media-manager' ); ?></p>
						</div>
					</fieldset>

					<fieldset class="fmm-field">
						<legend class="fmm-field__label"><?php esc_html_e( 'Restore last folder', 'fena-media-manager' ); ?></legend>
						<div class="fmm-field__control">
							<label class="fmm-choice" for="fmm-restore-last">
								<input type="checkbox" id="fmm-restore-last" name="<?php echo esc_attr( $name ); ?>[restore_last_folder]" value="1" aria-describedby="fmm-restore-help"<?php checked( $restore ); ?> />
								<?php esc_html_e( 'Open the folder that was selected last', 'fena-media-manager' ); ?>
							</label>
							<p class="fmm-field__help" id="fmm-restore-help"><?php esc_html_e( 'Remembered per user in this browser.', 'fena-media-manager' ); ?></p>
						</div>
					</fieldset>

					<div class="fmm-field">
						<div class="fmm-field__label">
							<label for="fmm-upload-folder"><?php esc_html_e( 'Default upload folder', 'fena-media-manager' ); ?></label>
						</div>
						<div class="fmm-field__control">
							<select id="fmm-upload-folder" name="<?php echo esc_attr( $name ); ?>[upload_folder]" aria-describedby="fmm-upload-folder-help">
								<option value="0"><?php esc_html_e( 'None', 'fena-media-manager' ); ?></option>
								<?php foreach ( FMM_Taxonomy::get_folder_tree() as $folder ) : ?>
									<option value="<?php echo esc_attr( $folder['id'] ); ?>" data-depth="<?php echo esc_attr( $folder['depth'] ); ?>" data-name="<?php echo esc_attr( $folder['name'] ); ?>" data-color="<?php echo esc_attr( $folder['color'] ); ?>" data-icon="<?php echo esc_attr( $folder['icon'] ); ?>"<?php selected( $upload_to, $folder['id'] ); ?>><?php echo esc_html( FMM_Taxonomy::tree_label( $folder ) ); ?></option>
								<?php endforeach; ?>
							</select>
							<p class="fmm-field__help" id="fmm-upload-folder-help"><?php esc_html_e( 'Uploads in the media library or media modal go into this folder when “All Media” is selected. A selected folder always takes precedence; uploads in “Unassigned” stay unassigned.', 'fena-media-manager' ); ?></p>
						</div>
					</div>

					<div class="fmm-card__footer">
						<?php submit_button( __( 'Save Changes', 'fena-media-manager' ), 'primary', 'submit', false ); ?>
					</div>
				</section>
			</form>
			<?php FMM_Transfer::render_section(); ?>
			<?php self::render_donate_card(); ?>
		</div>
		<?php
	}
}
