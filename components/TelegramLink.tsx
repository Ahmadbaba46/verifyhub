'use client';
import { useState } from 'react';
import { call } from './client';

export default function TelegramLink({ botName }: { botName?: string }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  async function gen() {
    setErr('');
    const r = await call('/api/telegram/link');
    r.ok ? setCode(r.data.code) : setErr(r.data.error ?? 'Could not create a code');
  }
  return (
    <div>
      <button className="btn" onClick={gen}>Get a link code</button>
      {code && (
        <div className="promo" style={{ marginTop: 16 }}>
          Send this code to {botName ? <a href={`https://t.me/${botName}?start=${code}`}>@{botName}</a> : 'the bot'} within 10 minutes: <b style={{ fontSize: 20 }}>{code}</b>
        </div>
      )}
      {err && <div className="alert err">{err}</div>}
    </div>
  );
}
