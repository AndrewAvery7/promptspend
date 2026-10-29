# PromptSpend as an Agent Skill

[`promptspend/SKILL.md`](promptspend/SKILL.md) gives an agent the same three
tools as the [MCP server](../mcp/README.md) (prices, past prices, cost
estimates and cheaper models) as calls to the hosted server at
`https://promptspend.dev/mcp`.

The difference is when it costs context. MCP tool definitions load into every
turn while the server is connected; the MCP server's are about 897 tokens. A
skill loads only its name and one-sentence description until a price question
comes up, then reads the rest. If you connect many MCP servers and watch your
context budget, use the skill; if you want the tools always to hand, use the
server. The answers are identical, because both call the same code.

## Install

Claude Code, for every project (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills\promptspend" | Out-Null
Invoke-WebRequest https://raw.githubusercontent.com/AndrewAvery7/promptspend/main/skills/promptspend/SKILL.md -OutFile "$HOME\.claude\skills\promptspend\SKILL.md"
```

macOS or Linux:

```bash
mkdir -p ~/.claude/skills/promptspend
curl -fsSL https://raw.githubusercontent.com/AndrewAvery7/promptspend/main/skills/promptspend/SKILL.md \
  -o ~/.claude/skills/promptspend/SKILL.md
```

For one project only, put it in that project's `.claude/skills/promptspend/`
instead. Any agent that reads `SKILL.md` files can use the same file, because
it is plain instructions plus one HTTP call.
