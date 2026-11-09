import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireUser();
  const base = (process.env.APP_URL ?? 'https://your-domain') + '/v1';

  return (
    <>
      <h1>API docs</h1>
      <p className="muted">Everything your server needs to connect to Verify Hub. <Link href="/api-keys">Manage your keys →</Link></p>

      <div className="card">
        <h2>Quick start</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Create a <strong>test</strong> key on the API keys page. It returns sample people and is free.</li>
          <li>Send the request below from your server. The base address is <span className="mono">{base}</span>.</li>
          <li>When it works, create a <strong>live</strong> key, add your server&rsquo;s IP address, and swap the key.</li>
        </ol>
        <pre className="codeblock">{`curl ${base}/nin/validate \\
  -H "Authorization: Bearer vh_live_…" \\
  -H "Idempotency-Key: order-1042" \\
  -H "Content-Type: application/json" \\
  -d '{"nin": "12345678901"}'`}</pre>
      </div>

      <div className="card">
        <h2>Authentication</h2>
        <p>Send your key as a Bearer token on every request, over HTTPS, from an allowed IP address. Keys are secret: call the API from your server, never from a browser or mobile app.</p>
        <p className="muted" style={{ background: 'var(--ground)', padding: '12px 14px', borderRadius: 10 }}>
          <strong>Retries are safe.</strong> Add an <span className="mono">Idempotency-Key</span> header with a unique value per real-world action. A repeat with the same value within 24 hours returns the first answer and is not charged again.
        </p>
      </div>

      <div className="card">
        <h2>Endpoints</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Endpoint</th><th>Does</th><th>Body</th></tr></thead>
            <tbody>
              <tr><td className="mono" style={{ fontSize: 13 }}>POST /v1/nin/validate</td><td>Details on record for a NIN</td><td className="mono" style={{ fontSize: 12 }}>nin</td></tr>
              <tr><td className="mono" style={{ fontSize: 13 }}>POST /v1/bvn/validate</td><td>Details linked to a BVN</td><td className="mono" style={{ fontSize: 12 }}>bvn</td></tr>
              <tr><td className="mono" style={{ fontSize: 13 }}>POST /v1/match</td><td>Looks up NIN then passport, compares them</td><td className="mono" style={{ fontSize: 12 }}>nin, nin_dob, passport_number, passport_dob</td></tr>
              <tr><td className="mono" style={{ fontSize: 13 }}>POST /v1/tin/lookup</td><td>Finds a tax ID by NIN or RC number</td><td className="mono" style={{ fontSize: 12 }}>taxpayer_type, and nin or rc</td></tr>
              <tr><td className="mono" style={{ fontSize: 13 }}>GET /v1/balance</td><td>Your wallet balance (free)</td><td className="muted">none</td></tr>
            </tbody>
          </table>
        </div>
        <pre className="codeblock">{`// 200 OK — this request was charged 11000 kobo (₦110)
{
  "request_id": "req_9f2c71",
  "charged": 11000,
  "data": {
    "surname": "Okafor",
    "first_name": "Tunde",
    "middle_name": "Chinedu",
    "date_of_birth": "1989-11-02",
    "gender": "Male"
  }
}`}</pre>
        <pre className="codeblock">{`// 404 Not found — not charged
{ "request_id": "req_9f2c61", "charged": 0,
  "error": { "code": "not_found", "message": "No record matches this request." } }`}</pre>
      </div>

      <div className="card">
        <h2>Billing rules</h2>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>You are charged <strong>only when a result is returned</strong> (status 200), at your agreed price.</li>
          <li>Not found, invalid input, provider errors and rate limits are free.</li>
          <li>For the match endpoint you pay only if both the NIN and the passport are found.</li>
          <li>Every response shows <span className="mono">charged</span> in kobo (100 kobo = ₦1).</li>
        </ul>
      </div>

      <div className="card">
        <h2>Errors</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Status</th><th>Code</th><th>Meaning</th><th>Charged?</th></tr></thead>
            <tbody>
              <tr><td>200</td><td className="mono" style={{ fontSize: 13 }}>ok</td><td>A result was found</td><td><strong>Yes</strong></td></tr>
              <tr><td>401</td><td className="mono" style={{ fontSize: 13 }}>invalid_key</td><td>Key missing, wrong or revoked</td><td>No</td></tr>
              <tr><td>402</td><td className="mono" style={{ fontSize: 13 }}>insufficient_funds</td><td>Wallet balance too low</td><td>No</td></tr>
              <tr><td>403</td><td className="mono" style={{ fontSize: 13 }}>ip_not_allowed</td><td>Address not on the key&rsquo;s allowlist</td><td>No</td></tr>
              <tr><td>404</td><td className="mono" style={{ fontSize: 13 }}>not_found</td><td>No matching record</td><td>No</td></tr>
              <tr><td>422</td><td className="mono" style={{ fontSize: 13 }}>invalid_input</td><td>Malformed input</td><td>No</td></tr>
              <tr><td>429</td><td className="mono" style={{ fontSize: 13 }}>rate_limited</td><td>Too many requests, or daily cap reached</td><td>No</td></tr>
              <tr><td>502</td><td className="mono" style={{ fontSize: 13 }}>provider_error</td><td>Upstream service failed</td><td>No</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Testing</h2>
        <p className="muted">With a test key, the input&rsquo;s last digits decide the result:</p>
        <div className="scroll">
          <table>
            <thead><tr><th>Input ends with</th><th>Result</th></tr></thead>
            <tbody>
              <tr><td className="mono">…000</td><td>404 not found</td></tr>
              <tr><td className="mono">…999</td><td>502 provider error</td></tr>
              <tr><td>any other digit</td><td>A sample person, 200</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
