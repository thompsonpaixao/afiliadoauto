import { WhatsAppProvider } from './types';
import { EvolutionProvider } from './evolution-provider';

export * from './types';
export * from './evolution-provider';
export * from './openwa-provider';

let instance: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (!instance) {
    instance = new EvolutionProvider();
  }
  return instance;
}
