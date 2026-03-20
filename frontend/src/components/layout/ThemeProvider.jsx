import { createContext, useContext, useState, useEffect } from 'react';

const THEMES = [
    { id: 'dark',      name: 'Dark',      colors: ['#0f1117', '#4f8ef7'] },
    { id: 'light',     name: 'Light',     colors: ['#f0f2f5', '#3b82f6'] },
    { id: 'cyberpunk', name: 'Cyberpunk', colors: ['#0a0015', '#ff00ff'] },
    { id: 'ocean',     name: 'Ocean',     colors: ['#091a2a', '#00b4d8'] },
    { id: 'sunset',    name: 'Sunset',    colors: ['#1a0f0a', '#f97316'] },
];

// ─── Vuetify class name aliases added to Marathon elements when a community theme is active ───
// Mainsail themes (Vuetify 2 and 3) target specific DOM class names for backgrounds, fonts, etc.
// We add those class names to Marathon's equivalent elements so CSS rules match.
//
// Structural elements:
//   body        → v-application  theme--dark  v-theme--dark  v-locale--is-ltr
//   .navbar     → v-app-bar  v-toolbar  theme--dark
//   .sidebar    → v-navigation-drawer  theme--dark
//   .app-main   → v-main
//
// Component-level: .btn → v-btn,  .printer-card → v-card theme--dark
// (applied via querySelectorAll so new elements added after mount also get them)

const VUETIFY_BODY = ['v-application', 'theme--dark', 'v-theme--dark', 'v-locale--is-ltr'];

const VUETIFY_LAYOUT = [
    { sel: '.navbar',   cls: ['v-app-bar', 'v-toolbar', 'theme--dark'] },
    { sel: '.sidebar',  cls: ['v-navigation-drawer', 'theme--dark'] },
    { sel: '.app-main', cls: ['v-main'] },
];

const VUETIFY_COMPONENTS = [
    { sel: '.btn', cls: ['v-btn'] },
    // .printer-card intentionally excluded: v-card/theme--dark are baked into PrinterCard JSX
    // so ThemeProvider adding/removing them on theme switch would cause a flash and fight React.
];

function addVuetifyClasses() {
    document.body.classList.add(...VUETIFY_BODY);
    for (const { sel, cls } of VUETIFY_LAYOUT) {
        document.querySelector(sel)?.classList.add(...cls);
    }
    for (const { sel, cls } of VUETIFY_COMPONENTS) {
        document.querySelectorAll(sel).forEach(el => el.classList.add(...cls));
    }
}

function removeVuetifyClasses() {
    document.body.classList.remove(...VUETIFY_BODY);
    for (const { sel, cls } of VUETIFY_LAYOUT) {
        document.querySelector(sel)?.classList.remove(...cls);
    }
    for (const { sel, cls } of VUETIFY_COMPONENTS) {
        document.querySelectorAll(sel).forEach(el => el.classList.remove(...cls));
    }
}

// ─── Polyfill: bridge Vuetify (v2 + v3) CSS vars → Marathon CSS vars ───────────────────
//
// Vuetify 3: colours stored as space-sep RGB ("R G B") on --v-theme-* → needs rgb() wrapper
// Vuetify 2: colours stored as hex on --v-primary-base etc., set on .v-application (body)
//
// We set Marathon vars from Vuetify 3 vars on :root (fallback defaults),
// then OVERRIDE those from Vuetify 2 vars on body.v-application (higher specificity, later cascade).
// This means both v2 and v3 themes work; whichever is present wins.
const MAINSAIL_POLYFILL = `
/* ── Vuetify 3 → Marathon (space-sep RGB, set on :root by v3 themes) ── */
:root {
    --bg:         rgb(var(--v-theme-background,       15 17 23))    !important;
    --surface:    rgb(var(--v-theme-surface,          26 29 39))    !important;
    --surface2:   rgb(var(--v-theme-surface-variant,  37 40 54))    !important;
    --text:       rgb(var(--v-theme-on-surface,       226 232 240)) !important;
    --text-muted: rgba(var(--v-theme-on-surface,      136 146 164), 0.7) !important;
    --primary:    rgb(var(--v-theme-primary,          79 142 247))  !important;
    --primary-d:  rgb(var(--v-theme-primary-darken-1, 58 114 216))  !important;
    --danger:     rgb(var(--v-theme-error,            224 92 92))   !important;
    --warning:    rgb(var(--v-theme-warning,          240 168 56))  !important;
    --success:    rgb(var(--v-theme-success,          76 175 135))  !important;
    --border:     rgba(var(--v-theme-on-surface,      255 255 255), 0.15) !important;
}

/* ── Vuetify 2 → Marathon (hex vars set on .v-application by v2 themes) ── */
/* body has class v-application, so these inherit the v2 vars set by themes. */
/* Specificity 0,1,1 > :root 0,0,0 so these win when v2 vars are defined.   */
body.v-application {
    --primary:   var(--v-primary-base,   var(--primary))   !important;
    --primary-d: var(--v-primary-base,   var(--primary-d)) !important;
    --danger:    var(--v-error-base,     var(--danger))     !important;
    --warning:   var(--v-warning-base,   var(--warning))    !important;
    --success:   var(--v-success-base,   var(--success))    !important;
    --surface:   var(--v-sheet-bg-color, var(--surface))    !important;
}

/* ── Structural bridge ── */
/* body carries the background-image (from .v-application rules).               */
/* Make intermediate Marathon containers transparent so the image shows through. */
body.v-application {
    background-size:     cover     !important;
    background-attachment: fixed   !important;
    background-position: center    !important;
    min-height: 100vh;
}
body.v-application #root,
body.v-application .app-shell,
body.v-application .app-body,
body.v-application .app-main {
    background-color: transparent !important;
}
`;

const ThemeContext = createContext({
    theme: 'dark',
    setTheme: () => {},
    themes: THEMES,
    communityTheme: null,
    setCommunityTheme: () => {},
});

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(
        () => localStorage.getItem('marathon-theme') || 'dark'
    );
    const [communityTheme, setCommunityThemeState] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('marathon-community-theme') || 'null');
        } catch {
            return null;
        }
    });

    function setTheme(id) {
        setThemeState(id);
        localStorage.setItem('marathon-theme', id);
        setCommunityThemeState(null);
        localStorage.removeItem('marathon-community-theme');
    }

    function setCommunityTheme(themeObj) {
        if (themeObj) {
            setCommunityThemeState(themeObj);
            localStorage.setItem('marathon-community-theme', JSON.stringify(themeObj));
            setThemeState('community');
            localStorage.setItem('marathon-theme', 'community');
        } else {
            setCommunityThemeState(null);
            localStorage.removeItem('marathon-community-theme');
            setThemeState('dark');
            localStorage.setItem('marathon-theme', 'dark');
        }
    }

    // Built-in themes: controlled via data-theme on <html>
    useEffect(() => {
        if (theme === 'community') return; // community effect owns data-theme when active
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        // Clean up any lingering community theme artefacts when switching to built-in
        document.getElementById('marathon-community-css')?.remove();
        document.getElementById('marathon-community-polyfill')?.remove();
        removeVuetifyClasses();
    }, [theme]);

    // Community themes: <link> tag + polyfill + Vuetify DOM class aliases
    useEffect(() => {
        const LINK_ID = 'marathon-community-css';
        const POLY_ID = 'marathon-community-polyfill';

        function cleanup() {
            document.getElementById(LINK_ID)?.remove();
            document.getElementById(POLY_ID)?.remove();
            removeVuetifyClasses();
        }

        if (theme !== 'community' || !communityTheme?.cssPath) {
            cleanup();
            return;
        }

        // Inject the Mainsail CSS as a <link> — relative URLs in the CSS resolve locally
        // because the repo is git-cloned to the server and served at /themes/{name}/
        let link = document.getElementById(LINK_ID);
        if (!link) {
            link = document.createElement('link');
            link.id = LINK_ID;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        link.href = communityTheme.cssPath;

        // Inject the polyfill after the Mainsail CSS so it wins for CSS var assignments
        let poly = document.getElementById(POLY_ID);
        if (!poly) {
            poly = document.createElement('style');
            poly.id = POLY_ID;
            document.head.appendChild(poly);
        }
        poly.textContent = MAINSAIL_POLYFILL;

        // Add Vuetify class names to Marathon layout elements so Mainsail CSS rules match.
        // Deferred one tick to guarantee all layout elements are in the DOM.
        const t = setTimeout(addVuetifyClasses, 0);

        document.documentElement.setAttribute('data-theme', 'community');

        return () => { clearTimeout(t); cleanup(); };
    }, [theme, communityTheme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, communityTheme, setCommunityTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
