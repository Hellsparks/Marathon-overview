# Marathon MCP Server

Exposes Marathon's printer fleet as MCP tools for Claude.

## Setup

```bash
cd mcp-server
npm install
```

## Transport modes

The server supports two transport modes:

### Stdio (default — Claude Code / Claude Desktop)

No extra config needed. Claude Code picks this up automatically via `.mcp.json`.

For Claude Desktop, add to `claude_desktop_config.json` (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "marathon": {
      "command": "node",
      "args": ["D:/Github/Marathon-overview/mcp-server/src/index.js"],
      "env": {
        "MARATHON_URL": "http://localhost:3000"
      }
    }
  }
}
```

### HTTP / Streamable-HTTP (for clients that require a URL)

Run the server as a persistent HTTP process:

```bash
MCP_TRANSPORT=http MCP_PORT=3001 MARATHON_URL=http://localhost:3000 node src/index.js
```

Then add the endpoint URL in your MCP client:

```
http://localhost:3001/mcp
```

For HTTPS, put the server behind an nginx reverse proxy with a TLS certificate (see below).

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `MARATHON_URL` | `http://localhost:3000` | Marathon backend URL |
| `MCP_TRANSPORT` | _(stdio)_ | Set to `http` for HTTP mode |
| `MCP_PORT` | `3001` | HTTP listen port |

#### nginx HTTPS reverse proxy example

```nginx
location /mcp-server/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
}
```

Then connect clients to `https://your-host/mcp-server/mcp`.

Set `MARATHON_URL` to wherever Marathon is running (e.g. `http://192.168.1.10:3000` for a remote instance).

## Tools

| Tool | Description |
|---|---|
| `list_printers` | All printers + live status |
| `get_printer_status` | Detailed status for one printer |
| `set_temperature` | Set hotend/bed temp |
| `send_gcode` | Send raw G-code |
| `list_macros` | List printer macros |
| `run_macro` | Execute a macro |
| `start_print` | Start a file |
| `pause_print` | Pause current job |
| `resume_print` | Resume paused job |
| `cancel_print` | Cancel current job |
| `list_files` | G-code library |
| `check_file_compatibility` | Bed size + filament check |
| `send_file_to_printer` | Push file to printer storage |
| `get_queue` | Get print queue |
| `add_to_queue` | Add files to queue |
| `remove_from_queue` | Remove queue entry |
| `start_queue` | Start queue processing |
| `list_projects` | List projects/plates |
| `print_plate` | Send plate to printer |
| `assign_filament_to_plate` | Link spool to plate |
| `list_spools` | All Spoolman spools |
| `get_spool` | Single spool details |
| `create_spool` | Register a new spool |
| `measure_spool` | Update remaining filament by scale weight |
| `delete_spool` | Delete a spool |
| `assign_spool_to_printer` | Set active spool (+ Bambu AMS) |
| `use_filament` | Log filament consumption |
| `get_ams_slots` | Bambu AMS tray assignments |
| `get_inventory` | Filament stock levels |
| `list_vendors` | All manufacturers |
| `create_vendor` | Add a manufacturer |
| `update_vendor` | Edit a manufacturer |
| `delete_vendor` | Remove a manufacturer |
| `list_filaments` | Filament profiles |
| `create_filament` | Add a filament profile |
| `update_filament` | Edit a filament profile |
| `delete_filament` | Remove a filament profile |
| `list_maintenance` | Maintenance due/overdue status |
| `log_maintenance_done` | Mark task complete |
| `get_fleet_stats` | Fleet-wide print stats |
| `get_file_stats` | Per-file stats |
| `get_utilization` | Per-printer runtime stats |
| `get_print_history` | Recent print job history |
