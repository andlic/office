#ifndef QT_WAYLAND_XDG_SHELL_UNSTABLE_V6
#define QT_WAYLAND_XDG_SHELL_UNSTABLE_V6

#include <QtWaylandClient/private/wayland-xdg-shell-unstable-v6-client-protocol.h>
#include <QByteArray>
#include <QString>

QT_BEGIN_NAMESPACE
QT_WARNING_PUSH
QT_WARNING_DISABLE_GCC("-Wmissing-field-initializers")

#if !defined(Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT)
#  if defined(QT_SHARED)
#    define Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT Q_DECL_EXPORT
#  else
#    define Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT
#  endif
#endif

namespace QtWayland {
    class Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT zxdg_shell_v6
    {
    public:
        zxdg_shell_v6(struct ::wl_registry *registry, int id, int version);
        zxdg_shell_v6(struct ::zxdg_shell_v6 *object);
        zxdg_shell_v6();

        virtual ~zxdg_shell_v6();

        void init(struct ::wl_registry *registry, int id, int version);
        void init(struct ::zxdg_shell_v6 *object);

        struct ::zxdg_shell_v6 *object() { return m_zxdg_shell_v6; }
        const struct ::zxdg_shell_v6 *object() const { return m_zxdg_shell_v6; }

        bool isInitialized() const;

        static const struct ::wl_interface *interface();

        enum error {
            error_role = 0, // given wl_surface has another role
            error_defunct_surfaces = 1, // xdg_shell was destroyed before children
            error_not_the_topmost_popup = 2, // the client tried to map or destroy a non-topmost popup
            error_invalid_popup_parent = 3, // the client specified an invalid popup parent surface
            error_invalid_surface_state = 4, // the client provided an invalid surface state
            error_invalid_positioner = 5 // the client provided an invalid positioner
        };

        void destroy();
        struct ::zxdg_positioner_v6 *create_positioner();
        struct ::zxdg_surface_v6 *get_xdg_surface(struct ::wl_surface *surface);
        void pong(uint32_t serial);

    protected:
        virtual void zxdg_shell_v6_ping(uint32_t serial);

    private:
        void init_listener();
        static const struct zxdg_shell_v6_listener m_zxdg_shell_v6_listener;
        static void handle_ping(
            void *data,
            struct ::zxdg_shell_v6 *object,
            uint32_t serial);
        struct ::zxdg_shell_v6 *m_zxdg_shell_v6;
    };

    class Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT zxdg_positioner_v6
    {
    public:
        zxdg_positioner_v6(struct ::wl_registry *registry, int id, int version);
        zxdg_positioner_v6(struct ::zxdg_positioner_v6 *object);
        zxdg_positioner_v6();

        virtual ~zxdg_positioner_v6();

        void init(struct ::wl_registry *registry, int id, int version);
        void init(struct ::zxdg_positioner_v6 *object);

        struct ::zxdg_positioner_v6 *object() { return m_zxdg_positioner_v6; }
        const struct ::zxdg_positioner_v6 *object() const { return m_zxdg_positioner_v6; }

        bool isInitialized() const;

        static const struct ::wl_interface *interface();

        enum error {
            error_invalid_input = 0 // invalid input provided
        };

        enum anchor {
            anchor_none = 0, // the center of the anchor rectangle
            anchor_top = 1, // the top edge of the anchor rectangle
            anchor_bottom = 2, // the bottom edge of the anchor rectangle
            anchor_left = 4, // the left edge of the anchor rectangle
            anchor_right = 8 // the right edge of the anchor rectangle
        };

        enum gravity {
            gravity_none = 0, // center over the anchor edge
            gravity_top = 1, // position above the anchor edge
            gravity_bottom = 2, // position below the anchor edge
            gravity_left = 4, // position to the left of the anchor edge
            gravity_right = 8 // position to the right of the anchor edge
        };

        enum constraint_adjustment {
            constraint_adjustment_none = 0,
            constraint_adjustment_slide_x = 1,
            constraint_adjustment_slide_y = 2,
            constraint_adjustment_flip_x = 4,
            constraint_adjustment_flip_y = 8,
            constraint_adjustment_resize_x = 16,
            constraint_adjustment_resize_y = 32
        };

        void destroy();
        void set_size(int32_t width, int32_t height);
        void set_anchor_rect(int32_t x, int32_t y, int32_t width, int32_t height);
        void set_anchor(uint32_t anchor);
        void set_gravity(uint32_t gravity);
        void set_constraint_adjustment(uint32_t constraint_adjustment);
        void set_offset(int32_t x, int32_t y);

    private:
        struct ::zxdg_positioner_v6 *m_zxdg_positioner_v6;
    };

    class Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT zxdg_surface_v6
    {
    public:
        zxdg_surface_v6(struct ::wl_registry *registry, int id, int version);
        zxdg_surface_v6(struct ::zxdg_surface_v6 *object);
        zxdg_surface_v6();

        virtual ~zxdg_surface_v6();

        void init(struct ::wl_registry *registry, int id, int version);
        void init(struct ::zxdg_surface_v6 *object);

        struct ::zxdg_surface_v6 *object() { return m_zxdg_surface_v6; }
        const struct ::zxdg_surface_v6 *object() const { return m_zxdg_surface_v6; }

        bool isInitialized() const;

        static const struct ::wl_interface *interface();

        enum error {
            error_not_constructed = 1,
            error_already_constructed = 2,
            error_unconfigured_buffer = 3
        };

        void destroy();
        struct ::zxdg_toplevel_v6 *get_toplevel();
        struct ::zxdg_popup_v6 *get_popup(struct ::zxdg_surface_v6 *parent, struct ::zxdg_positioner_v6 *positioner);
        void set_window_geometry(int32_t x, int32_t y, int32_t width, int32_t height);
        void ack_configure(uint32_t serial);

    protected:
        virtual void zxdg_surface_v6_configure(uint32_t serial);

    private:
        void init_listener();
        static const struct zxdg_surface_v6_listener m_zxdg_surface_v6_listener;
        static void handle_configure(
            void *data,
            struct ::zxdg_surface_v6 *object,
            uint32_t serial);
        struct ::zxdg_surface_v6 *m_zxdg_surface_v6;
    };

    class Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT zxdg_toplevel_v6
    {
    public:
        zxdg_toplevel_v6(struct ::wl_registry *registry, int id, int version);
        zxdg_toplevel_v6(struct ::zxdg_toplevel_v6 *object);
        zxdg_toplevel_v6();

        virtual ~zxdg_toplevel_v6();

        void init(struct ::wl_registry *registry, int id, int version);
        void init(struct ::zxdg_toplevel_v6 *object);

        struct ::zxdg_toplevel_v6 *object() { return m_zxdg_toplevel_v6; }
        const struct ::zxdg_toplevel_v6 *object() const { return m_zxdg_toplevel_v6; }

        bool isInitialized() const;

        static const struct ::wl_interface *interface();

        enum resize_edge {
            resize_edge_none = 0,
            resize_edge_top = 1,
            resize_edge_bottom = 2,
            resize_edge_left = 4,
            resize_edge_top_left = 5,
            resize_edge_bottom_left = 6,
            resize_edge_right = 8,
            resize_edge_top_right = 9,
            resize_edge_bottom_right = 10
        };

        enum state {
            state_maximized = 1, // the surface is maximized
            state_fullscreen = 2, // the surface is fullscreen
            state_resizing = 3, // the surface is being resized
            state_activated = 4 // the surface is now activated
        };

        void destroy();
        void set_parent(struct ::zxdg_toplevel_v6 *parent);
        void set_title(const QString &title);
        void set_app_id(const QString &app_id);
        void show_window_menu(struct ::wl_seat *seat, uint32_t serial, int32_t x, int32_t y);
        void move(struct ::wl_seat *seat, uint32_t serial);
        void resize(struct ::wl_seat *seat, uint32_t serial, uint32_t edges);
        void set_max_size(int32_t width, int32_t height);
        void set_min_size(int32_t width, int32_t height);
        void set_maximized();
        void unset_maximized();
        void set_fullscreen(struct ::wl_output *output);
        void unset_fullscreen();
        void set_minimized();

    protected:
        virtual void zxdg_toplevel_v6_configure(int32_t width, int32_t height, wl_array *states);
        virtual void zxdg_toplevel_v6_close();

    private:
        void init_listener();
        static const struct zxdg_toplevel_v6_listener m_zxdg_toplevel_v6_listener;
        static void handle_configure(
            void *data,
            struct ::zxdg_toplevel_v6 *object,
            int32_t width,
            int32_t height,
            wl_array *states);
        static void handle_close(
            void *data,
            struct ::zxdg_toplevel_v6 *object);
        struct ::zxdg_toplevel_v6 *m_zxdg_toplevel_v6;
    };

    class Q_WAYLAND_CLIENT_XDG_SHELL_UNSTABLE_V6_EXPORT zxdg_popup_v6
    {
    public:
        zxdg_popup_v6(struct ::wl_registry *registry, int id, int version);
        zxdg_popup_v6(struct ::zxdg_popup_v6 *object);
        zxdg_popup_v6();

        virtual ~zxdg_popup_v6();

        void init(struct ::wl_registry *registry, int id, int version);
        void init(struct ::zxdg_popup_v6 *object);

        struct ::zxdg_popup_v6 *object() { return m_zxdg_popup_v6; }
        const struct ::zxdg_popup_v6 *object() const { return m_zxdg_popup_v6; }

        bool isInitialized() const;

        static const struct ::wl_interface *interface();

        enum error {
            error_invalid_grab = 0 // tried to grab after being mapped
        };

        void destroy();
        void grab(struct ::wl_seat *seat, uint32_t serial);

    protected:
        virtual void zxdg_popup_v6_configure(int32_t x, int32_t y, int32_t width, int32_t height);
        virtual void zxdg_popup_v6_popup_done();

    private:
        void init_listener();
        static const struct zxdg_popup_v6_listener m_zxdg_popup_v6_listener;
        static void handle_configure(
            void *data,
            struct ::zxdg_popup_v6 *object,
            int32_t x,
            int32_t y,
            int32_t width,
            int32_t height);
        static void handle_popup_done(
            void *data,
            struct ::zxdg_popup_v6 *object);
        struct ::zxdg_popup_v6 *m_zxdg_popup_v6;
    };
}

QT_WARNING_POP
QT_END_NAMESPACE

#endif
