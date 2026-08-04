# mcp-nyc-parks

NYC Parks Events MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `events` | Upcoming NYC Parks events (next ~14 days): free/low-cost outdoor, fitness, nature, kids and recreation-center programming. Filter by date window, category (e.g. "Best for Kids", "Sports", "Nature", "Fitness"), and keyword (title/park/location/description). |
| `categories` | List the categories used across NYC Parks events (with counts) — filterable facets like "Best for Kids", "Sports", "Nature Exploration", "Fitness". |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "nyc-parks": {
      "url": "https://gateway.pipeworx.io/nyc-parks/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Nyc Parks data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
