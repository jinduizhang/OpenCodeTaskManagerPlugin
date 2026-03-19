/**
 * Mock OpenCode Client for testing
 */

import type {
  OpenCodeClient,
  Session,
  SessionCreateOptions,
  PromptPart,
  LogOptions,
} from "../../src/types";

export interface MockSession extends Session {
  parts?: PromptPart[];
  deleted?: boolean;
}

export class MockOpenCodeClient implements OpenCodeClient {
  private sessions: Map<string, MockSession> = new Map();
  private sessionCounter = 0;
  private callHistory: Array<{
    method: string;
    args: unknown;
    timestamp: number;
  }> = [];
  private logHistory: LogOptions[] = [];

  // Session API
  session = {
    list: async (): Promise<Session[]> => {
      this.recordCall("session.list", {});
      return Array.from(this.sessions.values()).filter((s) => !s.deleted);
    },

    get: async (id: string): Promise<Session> => {
      this.recordCall("session.get", { id });
      const session = this.sessions.get(id);
      if (!session) {
        throw new Error(`Session ${id} not found`);
      }
      return session;
    },

    create: async (options: SessionCreateOptions): Promise<Session> => {
      this.recordCall("session.create", options);
      this.sessionCounter++;
      const session: MockSession = {
        id: `ses_mock_${this.sessionCounter}`,
        title: options.title || "Untitled",
        status: "running",
        data: options.data,
      };
      this.sessions.set(session.id, session);
      return session;
    },

    prompt: async (sessionId: string, parts: PromptPart[]): Promise<void> => {
      this.recordCall("session.prompt", { sessionId, parts });
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      session.parts = parts;
    },

    delete: async (id: string): Promise<void> => {
      this.recordCall("session.delete", { id });
      const session = this.sessions.get(id);
      if (session) {
        session.deleted = true;
      }
    },
  };

  // App API
  app = {
    log: async (options: LogOptions): Promise<void> => {
      this.recordCall("app.log", options);
      this.logHistory.push(options);
    },
  };

  // Helper methods for testing
  private recordCall(method: string, args: unknown): void {
    this.callHistory.push({
      method,
      args,
      timestamp: Date.now(),
    });
  }

  getCallHistory(method?: string): Array<{
    method: string;
    args: unknown;
    timestamp: number;
  }> {
    if (method) {
      return this.callHistory.filter((c) => c.method === method);
    }
    return [...this.callHistory];
  }

  getLogHistory(): LogOptions[] {
    return [...this.logHistory];
  }

  getSession(id: string): MockSession | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): MockSession[] {
    return Array.from(this.sessions.values());
  }

  clear(): void {
    this.sessions.clear();
    this.callHistory = [];
    this.logHistory = [];
    this.sessionCounter = 0;
  }

  // Simulate session completion (trigger session.idle)
  simulateSessionIdle(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "idle";
    }
  }

  // Simulate session error
  simulateSessionError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "error";
    }
  }
}
