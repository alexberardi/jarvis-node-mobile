declare module 'react-native-zeroconf' {
  export interface Service {
    name: string;
    fullName?: string;
    host?: string;
    port?: number;
    addresses?: string[];
    txt?: Record<string, string>;
  }

  type ZeroconfEvent =
    | 'start'
    | 'stop'
    | 'error'
    | 'found'
    | 'remove'
    | 'update'
    | 'resolved'
    | 'published'
    | 'unpublished';

  export default class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string, implType?: string): void;
    stop(implType?: string): void;
    getServices(): Record<string, Service>;
    on(event: 'resolved' | 'published' | 'unpublished', listener: (service: Service) => void): void;
    on(event: 'found' | 'remove', listener: (name: string) => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'start' | 'stop' | 'update', listener: () => void): void;
    on(event: ZeroconfEvent, listener: (...args: unknown[]) => void): void;
    removeAllListeners(event?: ZeroconfEvent): void;
  }
}
