# Connect assistants and policy agents

Kin has two distinct MCP surfaces. The public remote tools open a private browser workspace. Optional stdio pairing lets your own assistant manage a copied profile on your own loopback server. Neither grants approval authority.

## Public MCP workspace

`server/chatgpt.ts` serves Streamable HTTP at `/mcp` with:

| Tool                   | Behavior                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `kin_open_connections` | Opens the MCP Apps owner workspace; no profile read or state change |
| `kin_explain_privacy`  | Returns public privacy, consent, and implementation limits          |

Both accept an empty object. The UI resource is `ui://kin/connections.html`, using the MCP Apps resource MIME type. Owners enter and review sensitive intake in that browser workspace, separately opt in to a public capsule, and approve for themselves. The model has no tool to retrieve profiles, join the relay, publish a capsule, approve, or send chat.

The portable [plugin draft](../plugins/kin/README.md) provides a manifest and workflow skill. Configure an actual HTTPS MCP endpoint before packaging. It is not an approved or published OpenAI plugin.

## Pair your own local assistant

1. Run Kin locally with the launcher or `npm run dev`.
2. Create and review your browser profile. Open **My agent → Connect my agent**.
3. This explicit action copies the profile to the Kin server on your own computer. Review the disclosure before pairing.
4. Copy the generated configuration into your MCP-capable assistant. Keep the local server running.

The configuration includes a secret `KIN_CONNECTION_TOKEN`. It is session-scoped, expires after 24 hours, revokes on replacement or server-session deletion, and disappears on restart. Never commit it or include it in public issues. `KIN_URL` must be loopback HTTP; redirects are disabled.

| Tool                   | Behavior                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `kin_owner_get`        | Reads the copied profile and fictional proposals                    |
| `kin_owner_update`     | Saves a validated server copy and invalidates that copy's proposals |
| `kin_discover`         | Runs fictional discovery                                            |
| `kin_decline_or_block` | Declines or blocks a fictional proposal                             |

The bearer cannot approve, simulate peer approval, pair, export, or delete. An assistant can read the full copied profile, including requirements and private notes; its provider's processing practices apply. Changes to the server copy do not automatically change the browser-held policy. Choose **Review assistant changes**, inspect the candidate profile, and explicitly **Use these preferences** to import it. This resets suggestions and closes the old network registration before rejoining.

Suggested instruction:

> Help me review my Kin profile using only information I explicitly provide. Keep hard requirements distinct from preferences and private advisory notes. Let me review changes. Do not approve or message anyone for me. Explain when data is being passed to the assistant provider.

## Integrate a policy agent

Run `npm run demo:agents -- friendship --wire` for a reproducible fictional exchange. Import `LocalPolicyAgent`, `protocolMessageSchema`, `runNegotiation`, `negotiate`, and `discoverWithCandidates` from `src/matchmaking/index.ts`. The browser network uses those same strict messages inside encryption; see [protocol](protocol.md).

This is a custom protocol, not an A2A adapter or stable external SDK. A replacement agent must preserve bilateral policy gates, limited disclosure, conversation routing/stages, and independent human authorization. Model-generated text must never override the executable policy or grant consent.
