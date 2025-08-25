'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React from 'react';
import { base } from 'wagmi/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import type { ReactNode } from 'react';

export function Providers(props: { children: ReactNode }) {
  React.useEffect(() => {
    // Patch navigator.credentials.create/get to prefer platform authenticators
    // (e.g. Windows Hello) and avoid forcing external hardware keys.
    // This shim runs only in the browser and is reversible on unmount.
    if (typeof window === 'undefined') return;
    const nav = window.navigator as Navigator | undefined;
    if (!nav || !(nav as any).credentials) return;

    // Use a lightweight shape for credentials to avoid broad `any`
    const creds = (nav as any).credentials as {
      create?: (options?: any) => Promise<any>;
      get?: (options?: any) => Promise<any>;
    };
    const originalCreate = creds.create?.bind(creds);
    const originalGet = creds.get?.bind(creds);

  const cloneOptions = (opts: unknown) => {
      try {
        if (typeof structuredClone === 'function') return structuredClone(opts);
        return JSON.parse(JSON.stringify(opts));
      } catch {
        return opts;
      }
    };

    if (originalCreate) {
      creds.create = async (options?: unknown) => {
        const o = cloneOptions(options);
        try {
          if ((o as any)?.publicKey) {
            const pk = (o as any).publicKey;
            pk.authenticatorSelection = {
              ...(pk.authenticatorSelection || {}),
              authenticatorAttachment: pk.authenticatorSelection?.authenticatorAttachment ?? 'platform',
              requireResidentKey: pk.authenticatorSelection?.requireResidentKey ?? false,
              residentKey: pk.authenticatorSelection?.residentKey ?? 'preferred',
            };
            pk.userVerification = pk.userVerification ?? 'preferred';
          }
        } catch {
          // ignore and call original
        }
        return originalCreate(o);
      };
    }

    if (originalGet) {
      creds.get = async (options?: unknown) => {
        const o = cloneOptions(options);
        try {
          if ((o as any)?.publicKey) {
            const pk = (o as any).publicKey;
            if (Array.isArray(pk.allowCredentials) && pk.allowCredentials.length > 0) {
              delete pk.allowCredentials;
            }
            pk.userVerification = pk.userVerification ?? 'preferred';
            pk.authenticatorSelection = {
              ...(pk.authenticatorSelection || {}),
              authenticatorAttachment: pk.authenticatorSelection?.authenticatorAttachment ?? 'platform',
            };
          }
        } catch {
          // ignore
        }
        return originalGet(o);
      };
    }

    return () => {
      if (originalCreate) creds.create = originalCreate;
      if (originalGet) creds.get = originalGet;
    };
  }, []);
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{ appearance: { 
            mode: 'auto',
        }
      }}
    >
      {props.children}
    </OnchainKitProvider>
  );
}

