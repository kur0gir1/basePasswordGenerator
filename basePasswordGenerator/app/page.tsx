"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useConnect, useDisconnect } from 'wagmi';
// keep imports minimal: we only need wallet and generator UI
import { useAccount } from 'wagmi';

// Removed demo component/template lists to keep page focused on wallet + generator

export default function App() {
  return (
    <div className="flex flex-col min-h-screen font-sans dark:bg-background dark:text-white bg-white text-black">
      <header className="pt-4 pr-4">
        <div className="flex justify-end items-center gap-3">
          <WalletHeader />
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <h1 className="text-center text-xl font-semibold mb-4">Wallet-gated Password Generator</h1>
          <PasswordGeneratorCard />
        </div>
      </main>
    </div>
  );
}

function PasswordGeneratorCard() {
  const { address, isConnected } = useAccount();
  const [running, setRunning] = useState(false);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [entropyBits, setEntropyBits] = useState(0);
  const [crackTime, setCrackTime] = useState('');
  const lastMoveRef = useRef<number | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const charSets = useRef({
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.<>?'
  });

  // basic entropy estimate based on used character sets and length
  function estimateEntropy(pw: string) {
    const setsUsed = new Set<string>();
    for (const ch of pw) {
      if (charSets.current.lower.includes(ch)) setsUsed.add('lower');
      else if (charSets.current.upper.includes(ch)) setsUsed.add('upper');
      else if (charSets.current.digits.includes(ch)) setsUsed.add('digits');
      else setsUsed.add('symbols');
    }
    let pool = 0;
    if (setsUsed.has('lower')) pool += charSets.current.lower.length;
    if (setsUsed.has('upper')) pool += charSets.current.upper.length;
    if (setsUsed.has('digits')) pool += charSets.current.digits.length;
    if (setsUsed.has('symbols')) pool += charSets.current.symbols.length;
    if (pool === 0) return 0;
    return Math.log2(pool) * pw.length;
  }

  function humanizeSeconds(s: number) {
    if (!isFinite(s)) return '∞';
    if (s < 1) return `${Math.round(s * 1000)} ms`;
    const units = [
      { k: 60, label: 's' },
      { k: 60, label: 'm' },
      { k: 24, label: 'h' },
      { k: 365, label: 'd' },
      { k: 1000, label: 'y' },
    ];
    let v = s;
    let i = 0;
    while (i < units.length && v >= units[i].k) {
      v = v / units[i].k;
      i++;
    }
    const labels = ['s', 'm', 'h', 'd', 'y', 'ky'];
    return `${v.toFixed(2)} ${labels[i]}`;
  }

  // simple crack time estimator: assume attacker can try X guesses/sec
  function estimateCrackTimeSeconds(entropyBits: number) {
    // choose a conservative guesses/sec (e.g., 1e9 for large attacker cluster)
    const guessesPerSec = 1e9;
    const combos = Math.pow(2, entropyBits);
    return combos / guessesPerSec;
  }

  function makeRandomChar() {
    // use crypto if available
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] / (0xffffffff + 1);
    }
    return Math.random();
  }

  const generateNext = useCallback((prev: string) => {
    // mix char sets based on current length to maximize strength
    const all = charSets.current.lower + charSets.current.upper + charSets.current.digits + charSets.current.symbols;
    const r = makeRandomChar();
    const idx = Math.floor(r * all.length);
    return prev + all.charAt(idx);
  }, []);

  useEffect(() => {
    if (!running) return;
  const onMove = () => {
      // only generate when running and user is moving the mouse
      const now = Date.now();
      lastMoveRef.current = now;
      setPassword((prev) => {
        const next = generateNext(prev);
        const eBits = estimateEntropy(next);
        setEntropyBits(Math.round(eBits));
        setCrackTime(humanizeSeconds(estimateCrackTimeSeconds(eBits)));
        // keep length bounded to avoid runaway UI (but still allow strong pw)
        if (next.length > 64) return next.slice(-64);
        return next;
      });
    };

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [running]);

  // double click toggles run; require wallet connected
  function onDoubleClick(e?: React.MouseEvent) {
    // prevent default selection behavior and clear any existing selection
    e?.preventDefault();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    if (!isConnected) return;
    setRunning((r) => !r);
  }

  // reset on disconnect
  useEffect(() => {
    if (!isConnected) {
      setRunning(false);
      setPassword('');
      setEntropyBits(0);
      setCrackTime('');
    }
  }, [isConnected]);

    return (
    <div
      onDoubleClick={onDoubleClick}
      className={`w-full border rounded p-4 text-left ${isConnected ? 'bg-white' : 'bg-gray-50 opacity-80'}`}
      style={{ cursor: isConnected ? 'crosshair' : 'not-allowed', userSelect: 'none', position: 'relative' }}
      role="button"
      title={isConnected ? 'Double-click to start/stop generation while moving your mouse' : 'Connect your wallet to enable generator'}
    >
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-semibold">Mouse-driven Password Generator</h3>
          <p className="text-sm text-gray-600">Double-click this card to start/stop. Move the mouse to add entropy.</p>
        </div>
        <div className="text-sm text-right">
          <div>{isConnected ? `Wallet: ${String(address).slice(0,6)}...` : 'Wallet required'}</div>
          <div className={`mt-1 ${running ? 'text-green-600' : 'text-gray-600'}`}>{running ? 'Generating' : 'Idle'}</div>
        </div>
      </div>

      <div className="mb-2">
        <label className="text-xs text-gray-500">Password preview</label>
        <div className="mt-1 p-2 bg-black rounded font-mono break-all flex items-start justify-between">
          <div className="flex-1 mr-2">{password || <em className="text-gray-400">(no password yet)</em>}</div>
        </div>
      </div>

      <div className="flex gap-4 text-sm text-gray-700">
        <div>Entropy: <strong>{entropyBits}</strong> bits</div>
        <div>Estimated crack time: <strong>{crackTime || '—'}</strong></div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className="px-3 py-1 rounded border bg-black text-white"
          onClick={async () => {
            // copy the current password and show a transient indicator
            if (!password) return;
            try {
              await navigator.clipboard?.writeText(password);
              setCopied(true);
              // clear previous timeout if any
              if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
              copyTimeoutRef.current = window.setTimeout(() => {
                setCopied(false);
                copyTimeoutRef.current = null;
              }, 2000) as unknown as number;
            } catch (e) {
              // ignore clipboard failures
            }
          }}
          disabled={!password}
        >
          Copy
        </button>
        <button
          className="px-3 py-1 rounded border bg-black text-white"
          onClick={() => {
            setPassword('');
            setEntropyBits(0);
            setCrackTime('');
          }}
        >
          Clear
        </button>
      </div>

      {/* transient copied indicator */}
      {copied && (
        <div className="absolute top-3 right-3 bg-green-600 text-white text-xs px-2 py-1 rounded shadow">
          Copied!
        </div>
      )}
    </div>
  );
}

function WalletHeader() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();

  const connect = async () => {
    try {
      // try wagmi connector first if available
      if (typeof (window as any).ethereum !== 'undefined') {
        // prefer a direct request if wagmi connector import is not available
        await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      } else {
        await connectAsync({ connector: undefined as any });
      }
    } catch (e) {
      // ignore
    }
  };

  const disconnect = async () => {
    try {
      await disconnectAsync();
    } catch {}
  };

  return (
    <div className="flex items-center gap-3">
      {isConnected ? (
        <>
          <div className="text-sm">{String(address).slice(0,6)}...</div>
          <button onClick={disconnect} className="px-2 py-1 border rounded">Disconnect</button>
        </>
      ) : (
        <button onClick={connect} className="px-3 py-1 rounded bg-orange-600 text-white">Connect MetaMask</button>
      )}
    </div>
  );
}

function MetaMaskButton() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();

  const connect = async () => {
    try {
      if (typeof (window as any).ethereum !== 'undefined') {
        await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      } else {
        await connectAsync({ connector: undefined as any });
      }
    } catch (e) {
      // ignore
    }
  };

  return isConnected ? (
    <div className="px-3 py-1 rounded border">Connected</div>
  ) : (
    <button onClick={connect} className="px-3 py-1 rounded bg-orange-600 text-white">Connect MetaMask</button>
  );
}
