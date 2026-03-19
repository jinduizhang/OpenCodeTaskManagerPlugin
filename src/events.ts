/**
 * OpenCode Task Manager Plugin - 事件系统
 * 
 * 实现发布/订阅模式的事件总线，用于组件间通信
 */

import type { TaskEvent, EventListener, TaskEventType } from "./types";

/**
 * 事件总线类
 * 
 * 实现发布/订阅模式，支持：
 * - 订阅特定类型的事件
 * - 发布事件并通知所有订阅者
 * - 取消订阅
 * - 一次性订阅
 */
export class EventBus {
  private listeners: Map<TaskEventType, Set<EventListener>> = new Map();
  private onceListeners: Map<TaskEventType, Set<EventListener>> = new Map();
  private allListeners: Set<EventListener<TaskEvent>> = new Set();

  /**
   * 订阅事件
   * @param eventType 事件类型
   * @param listener 监听器函数
   * @returns 取消订阅函数
   */
  on<T extends TaskEvent>(
    eventType: T["type"],
    listener: EventListener<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener as EventListener);

    // 返回取消订阅函数
    return () => {
      this.off(eventType, listener);
    };
  }

  /**
   * 一次性订阅事件
   * 监听器被调用一次后自动取消订阅
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  once<T extends TaskEvent>(
    eventType: T["type"],
    listener: EventListener<T>
  ): void {
    if (!this.onceListeners.has(eventType)) {
      this.onceListeners.set(eventType, new Set());
    }
    this.onceListeners.get(eventType)!.add(listener as EventListener);
  }

  /**
   * 取消订阅
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  off<T extends TaskEvent>(
    eventType: T["type"],
    listener: EventListener<T>
  ): void {
    this.listeners.get(eventType)?.delete(listener as EventListener);
    this.onceListeners.get(eventType)?.delete(listener as EventListener);
  }

  /**
   * 订阅所有事件
   * @param listener 监听器函数
   * @returns 取消订阅函数
   */
  onAll(listener: EventListener<TaskEvent>): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  /**
   * 发布事件
   * @param event 事件对象
   */
  async emit(event: TaskEvent): Promise<void> {
    const eventType = event.type;

    // 调用特定类型的监听器
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const promises = Array.from(listeners).map(async (listener) => {
        try {
          await listener(event);
        } catch (error) {
          console.error(`Event listener error for ${eventType}:`, error);
        }
      });
      await Promise.all(promises);
    }

    // 调用一次性监听器
    const onceListeners = this.onceListeners.get(eventType);
    if (onceListeners) {
      const promises = Array.from(onceListeners).map(async (listener) => {
        try {
          await listener(event);
        } catch (error) {
          console.error(`Once event listener error for ${eventType}:`, error);
        }
      });
      await Promise.all(promises);
      // 清除已调用的一次性监听器
      this.onceListeners.delete(eventType);
    }

    // 调用全局监听器
    const allPromises = Array.from(this.allListeners).map(async (listener) => {
      try {
        await listener(event);
      } catch (error) {
        console.error(`All event listener error:`, error);
      }
    });
    await Promise.all(allPromises);
  }

  /**
   * 同步发布事件（不等待监听器完成）
   * @param event 事件对象
   */
  emitSync(event: TaskEvent): void {
    const eventType = event.type;

    // 调用特定类型的监听器
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      for (const listener of listeners) {
        try {
          const result = listener(event);
          // 处理返回 Promise 的情况
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error(`Event listener error for ${eventType}:`, error);
            });
          }
        } catch (error) {
          console.error(`Event listener error for ${eventType}:`, error);
        }
      }
    }

    // 调用一次性监听器
    const onceListeners = this.onceListeners.get(eventType);
    if (onceListeners) {
      for (const listener of onceListeners) {
        try {
          const result = listener(event);
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error(`Once event listener error for ${eventType}:`, error);
            });
          }
        } catch (error) {
          console.error(`Once event listener error for ${eventType}:`, error);
        }
      }
      this.onceListeners.delete(eventType);
    }

    // 调用全局监听器
    for (const listener of this.allListeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(`All event listener error:`, error);
          });
        }
      } catch (error) {
        console.error(`All event listener error:`, error);
      }
    }
  }

  /**
   * 清除所有监听器
   */
  clear(): void {
    this.listeners.clear();
    this.onceListeners.clear();
    this.allListeners.clear();
  }

  /**
   * 获取特定事件类型的监听器数量
   * @param eventType 事件类型
   */
  listenerCount(eventType: TaskEventType): number {
    let count = 0;
    count += this.listeners.get(eventType)?.size || 0;
    count += this.onceListeners.get(eventType)?.size || 0;
    return count;
  }

  /**
   * 获取所有监听器数量
   */
  totalListenerCount(): number {
    let count = this.allListeners.size;
    for (const set of this.listeners.values()) {
      count += set.size;
    }
    for (const set of this.onceListeners.values()) {
      count += set.size;
    }
    return count;
  }
}

/**
 * 创建全局事件总线实例
 */
export function createEventBus(): EventBus {
  return new EventBus();
}

// 导出单例实例（可选）
export const globalEventBus = createEventBus();