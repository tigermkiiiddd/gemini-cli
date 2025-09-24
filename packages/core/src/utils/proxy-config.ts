/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * 代理配置管理器
 * 统一管理代理配置，支持从环境变量和命令行参数获取代理设置
 */
export class ProxyConfigManager {
  private static instance: ProxyConfigManager;
  private proxyUrl?: string | null;
  private initialized = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ProxyConfigManager {
    if (!this.instance) {
      this.instance = new ProxyConfigManager();
    }
    return this.instance;
  }

  /**
   * 获取代理 URL
   * 按优先级从以下来源获取：
   * 1. 手动设置的代理 URL
   * 2. HTTPS_PROXY 环境变量
   * 3. https_proxy 环境变量
   * 4. HTTP_PROXY 环境变量
   * 5. http_proxy 环境变量
   */
  getProxyUrl(): string | undefined {
    if (!this.initialized) {
      this.initializeFromEnvironment();
    }
    
    return this.proxyUrl || undefined;
  }

  /**
   * 手动设置代理 URL
   * @param url 代理服务器 URL，如 http://proxy.company.com:8080
   */
  setProxyUrl(url: string | null): void {
    this.proxyUrl = url;
    this.initialized = true;
  }

  /**
   * 从环境变量初始化代理配置
   */
  private initializeFromEnvironment(): void {
    // 按优先级获取代理配置
    this.proxyUrl = 
      process.env['HTTPS_PROXY'] ||
      process.env['https_proxy'] ||
      process.env['HTTP_PROXY'] ||
      process.env['http_proxy'] ||
      null;
    
    this.initialized = true;
  }

  /**
   * 检查是否配置了代理
   */
  hasProxy(): boolean {
    return !!this.getProxyUrl();
  }

  /**
   * 获取 NO_PROXY 环境变量配置
   * 返回不使用代理的域名列表
   */
  getNoProxyList(): string[] {
    const noProxy = process.env['NO_PROXY'] || process.env['no_proxy'];
    if (!noProxy) {
      return [];
    }
    
    return noProxy.split(',').map(domain => domain.trim()).filter(Boolean);
  }

  /**
   * 检查指定 URL 是否应该跳过代理
   * @param url 要检查的 URL
   */
  shouldSkipProxy(url: string): boolean {
    const noProxyList = this.getNoProxyList();
    if (noProxyList.length === 0) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      return noProxyList.some(pattern => {
        // 支持通配符匹配
        if (pattern.startsWith('.')) {
          return hostname.endsWith(pattern) || hostname === pattern.slice(1);
        }
        
        // 精确匹配
        return hostname === pattern;
      });
    } catch {
      return false;
    }
  }

  /**
   * 重置配置，强制重新从环境变量读取
   */
  reset(): void {
    this.proxyUrl = undefined;
    this.initialized = false;
  }
}