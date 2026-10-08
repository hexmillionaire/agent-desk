# Security

Use GitHub's private vulnerability reporting where available, or open a minimal issue asking for a private contact without publishing exploit details.

Agent Desk serves local task notes and Git file names on loopback. It is read-only, checks Host and Origin headers, and does not accept arbitrary repository paths in HTTP requests. It uses a restrictive Content Security Policy and renders task data as text. It is intended for a trusted single-user development machine and trusted repositories, not an internet-facing or multi-user server. Other processes running as you can read localhost or edit task files.

Review notes before sharing handoffs. No transcripts, environment files, or source file contents are collected by the dashboard. Task notes themselves may contain private data.
