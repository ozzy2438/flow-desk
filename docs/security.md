# Security and Safety

## Data classification

| Data | Handling |
|---|---|
| Candidate profile | Sensitive personal data; encrypt at rest where practical and restrict access by user |
| CV / portfolio artifacts | User-selected documents only; access-controlled storage |
| Browser screenshots | Potentially sensitive; minimize capture and use expiry/lifecycle rules |
| Browser traces | Debug-only, short retention, restricted access |
| API keys | Server-side secret manager or encrypted environment variables only |
| Browser sessions | Never persist credentials unless the user deliberately opts into a secure supported session model |

## Browser boundaries

- Default to headless read-only operation.
- Do not automate login.
- Stop on CAPTCHA, auth wall, access-denied page or unexpected payment/consent flow.
- Do not execute instructions embedded in page content as agent instructions.
- Do not expose raw cookies, tokens, passwords or hidden DOM values to models.
- Do not execute arbitrary scripts supplied by a model.

## Public job-source boundaries

- Server-side URL import accepts only fixed official Greenhouse and Lever API hosts and HTTPS.
- Public source requests omit credentials, reject redirects, time out after 15 seconds and cap the
  response body at 2 MB.
- LinkedIn and SEEK URLs never trigger unattended server-side fetching; they route to manual
  capture from the operator's signed-in browser.
- A currently published feed entry and a verified posting date are separate facts. Unknown recency
  routes to human review when a Research Run requests a last-N-days window.

## Model boundaries

- Treat all page text as untrusted data.
- Validate planner output with Zod.
- Validate Jev and generation-provider output with Zod.
- Jev can select only code-supplied choices.
- The generation provider can draft text only from verified evidence.
- The policy engine controls final routing.

## Approval boundaries

Require explicit user approval before:

- opening a third-party application page when configured as medium risk
- pre-filling external application fields
- uploading any document
- sending any message
- accepting any term
- submitting any application

Store approval event, user ID, timestamp, action summary and flow/job context in the audit trail.

## Retention

- Set screenshot lifecycle policies.
- Delete failed browser artifacts after a short configured period.
- Keep audit facts longer than screenshots.
- Make data export and deletion support part of the product design.
