const url = 'http://localhost:3000';

async function fixFilaments() {
    const settings = await fetch(`${url}/api/settings`).then(r => r.json());
    const filaments = await fetch(`${url}/api/spoolman/filaments`).then(r => r.json());

    const urlKey = settings.url_extra_field || 'url';

    let patched = 0;

    for (const f of filaments) {
        let changed = false;
        let newExtra = { ...(f.extra || {}) };

        // Check for erroneous "url" key if urlKey is different
        if (urlKey !== 'url' && f.extra && f.extra.url !== undefined) {
            newExtra[urlKey] = f.extra.url;
            delete newExtra.url;
            changed = true;
        }

        // Clean up quotes on ANY extra field
        for (const [k, v] of Object.entries(newExtra)) {
            if (typeof v === 'string') {
                let cleaned = v.trim();
                // Strip starting and ending quotes which MCP erroneously added inside the string
                if (cleaned.startsWith('"')) cleaned = cleaned.replace(/^"+/, '');
                if (cleaned.endsWith('"')) cleaned = cleaned.replace(/"+$/, '');

                if (cleaned !== v) {
                    newExtra[k] = cleaned;
                    changed = true;
                }
            }
        }

        if (changed) {
            console.log(`Patching filament ${f.id} (${f.name})`);
            const res = await fetch(`${url}/api/spoolman/filaments/${f.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extra: newExtra })
            });
            if (!res.ok) {
                console.error(`Failed to patch ${f.id}:`, await res.text());
            } else {
                patched++;
            }
        }
    }

    console.log(`Finished checking filaments. Patched ${patched}.`);
}

fixFilaments().catch(console.error);
