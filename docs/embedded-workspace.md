# Kin inside an MCP Apps host

Kin serves its complete React workspace as an MCP Apps HTML resource. The same application includes owner intake, fictional introductions and circles, saved connections, and the encrypted network panel. This is an implementation capability, not a claim that the published build has been tested in a real ChatGPT or Claude account. Optional loopback assistant pairing still requires a local installation.

## What the ruOS repository actually implements

Reviewed on 2026-10-07 at commit [`987b49dab5bb3523d42a874c4b3f5907cfb87e30`](https://github.com/ruvnet/ruos/tree/987b49dab5bb3523d42a874c4b3f5907cfb87e30). The public Rust server advertises tools-only capabilities and handles initialize, ping, tools/list, and tools/call. Its screenshots are PNG tool results; it has no UI resource registration or resources/read handler. This source does not implement an MCP Apps desktop viewer. [Server source](https://github.com/ruvnet/ruos/blob/987b49dab5bb3523d42a874c4b3f5907cfb87e30/mcp/src/main.rs#L269-L300).

The supported control transport is stdio over SSH. Its 16 tools include mouse/keyboard actions, shell execution, and desktop system actions. The repository documents a separate browser noVNC viewer and native desktop viewers. A hosted MCP gateway is described as future work. [MCP documentation](https://github.com/ruvnet/ruos/blob/987b49dab5bb3523d42a874c4b3f5907cfb87e30/mcp/README.md), [desktop architecture](https://github.com/ruvnet/ruos/blob/987b49dab5bb3523d42a874c4b3f5907cfb87e30/README.md#architecture).

| Surface          | Public ruOS implementation                 | Kin implementation                                       |
| ---------------- | ------------------------------------------ | -------------------------------------------------------- |
| Model connection | JSON-RPC over stdio/SSH                    | Streamable HTTP at `/mcp`                                |
| Model tools      | Desktop, shell, and system control         | Open the workspace and explain privacy                   |
| Interactive view | Separately documented noVNC browser viewer | Full React application in an MCP Apps HTML resource      |
| Owner actions    | Desktop operator access                    | Browser-local intake and explicit signed network choices |

Kin does not require a Linux VM, screenshot transport, or remote shell to render its workspace. Its existing HTML resource is the appropriate integration surface for this application.

## How Kin embeds the workspace

[`server/chatgpt.ts`](../server/chatgpt.ts) registers `ui://kin/connections.html` with the standard `text/html;profile=mcp-app` MIME type and links it to `kin_open_connections` through `_meta.ui.resourceUri`. It reads the trusted built `index.html`, turns Vite asset references into absolute deployment URLs, and supplies the widget marker and relay URL. No owner input is interpolated into that HTML.

[`src/main.tsx`](../src/main.tsx) mounts the same full [`App`](../src/App.tsx) used by the standalone browser. [`src/widget-host.ts`](../src/widget-host.ts) establishes the standard postMessage bridge. Its initialization declares `inline` and `fullscreen`; the server also supplies ChatGPT's optional resource display-mode metadata. The SDK's default resize observer already reports document-size changes. Host support determines the actual display mode. OpenAI recommends the shared MCP Apps bridge and declaring display modes during initialization as well as in resource metadata. [OpenAI UI reference](https://developers.openai.com/plugins/reference).

The public tools accept no profile or chat inputs. The bridge does not publish profiles, keys, negotiations, or chat as model context. Rendering the application does not authorize joining a network, approving an introduction, or sending a message. Those actions remain in the owner UI and use the relay's signature and bilateral-consent checks.

## Connection chat and private reflection

The embedded full workspace already contains Kin's encrypted human chat. It connects Kin participants through the relay after bilateral signed approval; it does not join two native ChatGPT conversations. Progressive disclosure, selected self-reflection for one's own AI, and reviewed local topic priorities now have pure source contracts, without browser integration or host messages yet. Human audio remains unimplemented and is denied by the current own-page microphone policy. See [connection conversations and exact boundaries](connection-conversations.md).

## Deployment and host compatibility boundaries

- **HTTPS endpoint:** The intended remote host needs a reachable `/mcp` deployment. Claude's remote connector requests originate from Anthropic's infrastructure; a loopback endpoint on the owner's computer is a separate local integration. Claude documents both inline and fullscreen interactive connectors. [Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- **Sandbox origin:** MCP Apps defines `ui.domain` as host-dependent. Kin currently supplies its HTTPS deployment origin. Confirm the intended host accepts and maps that value; a ChatGPT origin hint is not evidence of Claude compatibility. [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx#L185-L204).
- **Relay CORS:** Kin allows exact configured origins. The iframe's browser Origin can differ from the relay origin. Observe the actual sandbox Origin in the intended host and include that exact origin in `KIN_ALLOWED_ORIGINS`; keep ordinary client origins as required. Do not use a wildcard or assume the chat website's origin is the iframe origin. MCP discovery can succeed while signed network requests fail CORS.
- **Resource CSP:** Kin declares its deployment origin for connections and static assets. That covers its configured relay and Vite scripts, styles, and bundled fonts. A different relay entered in the form remains unavailable unless the embedding resource explicitly allows it and that relay accepts the sandbox Origin. Nested frames are not needed for Kin's current native React UI.
- **Browser permissions:** Camera, microphone, and geolocation are not requested. Clipboard support is optional and host-controlled. Sharing a public invite link may need the manual fallback when clipboard or Web Share is denied. Resource permissions do not guarantee a host grants access. [MCP Apps permission contract](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx#L151-L183).
- **Private export:** Sandboxed downloads may be blocked. Keep private export in the owner UI with a selectable manual fallback; do not place the export in a tool result, host message, widget state, or model context to make download work.
- **Storage:** Browser-local profiles and keys belong to the sandbox's storage partition. Persistence, reload behavior, and sharing across conversations depend on the host and browser. A standalone profile or identity is not automatically available in the embedded app. Test storage and Web Crypto before inviting real owners.

The standards-based resource supports portability, but host rendering, storage, permission, and origin behavior still require testing. OpenAI describes optional UI inside a sandboxed iframe, and Claude documents interactive connectors. Neither source establishes that this particular Kin build has passed their account-level tests. [OpenAI UI guide](https://developers.openai.com/plugins/build/chatgpt-ui), [Claude interactive connectors](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude).

## Conversation context

Opening an MCP application does not expose an owner's complete conversation history. OpenAI's current plugin policy prohibits a server from retrieving or reconstructing the full chat log; it limits processing to snippets and resources intentionally supplied by the client or model. Kin's public tool inputs are empty and its current bridge does not request conversational context. [OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

A future context-assisted intake can accept an owner-chosen excerpt or explicitly supplied resource, show proposed preferences for review, and save only the owner's approved fields. That workflow must preserve private notes, avoid inferred hard requirements, and obtain fresh consent for publication and introductions. It is not implemented by the embedded-workspace marker or display-mode change.

## Evidence and remaining validation

[`test/chatgpt.test.ts`](../test/chatgpt.test.ts) uses the real MCP SDK HTTP client to initialize, list tools, call tools, and read the HTML resource. It checks trusted absolute assets, resource metadata, annotation boundaries, public/private API separation, request size, and foreign-origin rejection. These tests establish the server contract; they do not run an actual ChatGPT or Claude iframe.

Before claiming a supported host, test its bridge handshake, inline and fullscreen rendering, exact CORS origin, storage reload, Web Crypto, owner profile creation, a two-owner encrypted introduction, independent approvals, block and leave, private export fallback, and mobile layout. Record the tested host/version and limits separately from ordinary browser and SDK tests.
