import * as http from 'http';
import * as https from 'https';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { ProxyConfigManager } from './proxy-config.js';

/**
 * 代理感知的网络请求工具
 * 提供统一的代理配置和网络请求接口
 */
export class ProxyAwareFetch {
  private static instance: ProxyAwareFetch;
  private proxyConfig: ProxyConfigManager;

  private constructor() {
    this.proxyConfig = ProxyConfigManager.getInstance();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ProxyAwareFetch {
    if (!ProxyAwareFetch.instance) {
      ProxyAwareFetch.instance = new ProxyAwareFetch();
    }
    return ProxyAwareFetch.instance;
  }

  /**
   * Create a proxy-aware fetch function that can be used as a drop-in replacement for fetch
   */
  createProxyAwareFetch(): typeof fetch {
    return async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      
      if (this.shouldSkipProxy(url)) {
        return fetch(input, init);
      }

      const agent = this.getProxyAgent(url);
      if (!agent) {
        return fetch(input, init);
      }

      // Use undici fetch with proxy agent
      const { fetch: undiciFetch } = await import('undici');
      
      // Create a clean init object without incompatible properties
      const cleanInit: any = {};
      if (init) {
        Object.keys(init).forEach(key => {
          if (key !== 'body' || (init as any)[key] === null || (init as any)[key] === undefined || typeof (init as any)[key] === 'string' || (init as any)[key] instanceof ArrayBuffer || (init as any)[key] instanceof Uint8Array) {
            (cleanInit as any)[key] = (init as any)[key];
          }
        });
      }
      
      const response = await undiciFetch(input as any, {
        ...cleanInit,
        dispatcher: agent,
      });
      
      // Convert undici Response to standard Response
      return response as unknown as Response;
    };
  }

  /**
   * 获取代理 agent
   * @param url 目标 URL
   */
  private getProxyAgent(url: string) {
    if (this.proxyConfig.shouldSkipProxy(url)) {
      return null;
    }

    const proxyUrl = this.proxyConfig.getProxyUrl();
    if (!proxyUrl) {
      return null;
    }

    return this.createProxyAgent(url, proxyUrl);
  }

  /**
   * 检查是否应该跳过代理
   * @param url 目标 URL
   */
  private shouldSkipProxy(url: string): boolean {
    return this.proxyConfig.shouldSkipProxy(url);
  }

  /**
   * 创建代理 agent
   * @param url 目标 URL
   * @param proxyUrl 代理服务器 URL
   */
  private createProxyAgent(url: string, proxyUrl: string) {
    const targetUrl = new URL(url);
    
    if (targetUrl.protocol === 'https:') {
      return new HttpsProxyAgent(proxyUrl);
    } else {
      return new HttpProxyAgent(proxyUrl);
    }
  }

  /**
   * 代理感知的 HTTPS 请求
   * 用于替换 Node.js 原生的 https.get 和 https.request
   */
  httpsRequest(
    url: string | URL,
    options: https.RequestOptions = {},
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    const targetUrl = typeof url === 'string' ? url : url.href;
    
    // 检查是否应该跳过代理
    if (this.proxyConfig.shouldSkipProxy(targetUrl)) {
      return https.request(url, options, callback);
    }

    const proxyUrl = this.proxyConfig.getProxyUrl();
    if (!proxyUrl) {
      return https.request(url, options, callback);
    }

    // 使用代理 agent
    const agent = new HttpsProxyAgent(proxyUrl);
    const requestOptions = {
      ...options,
      agent
    };

    return https.request(url, requestOptions, callback);
  }

  /**
   * 代理感知的 HTTPS GET 请求
   */
  httpsGet(
    url: string | URL,
    options: https.RequestOptions = {},
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    return this.httpsRequest(url, { ...options, method: 'GET' }, callback);
  }

  /**
   * 代理感知的 HTTP 请求
   * 用于替换 Node.js 原生的 http.get 和 http.request
   */
  httpRequest(
    url: string | URL,
    options: http.RequestOptions = {},
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    const targetUrl = typeof url === 'string' ? url : url.href;
    
    // 检查是否应该跳过代理
    if (this.proxyConfig.shouldSkipProxy(targetUrl)) {
      return http.request(url, options, callback);
    }

    const proxyUrl = this.proxyConfig.getProxyUrl();
    if (!proxyUrl) {
      return http.request(url, options, callback);
    }

    // 使用代理 agent
    const agent = new HttpProxyAgent(proxyUrl);
    const requestOptions = {
      ...options,
      agent
    };

    return http.request(url, requestOptions, callback);
  }

  /**
   * 代理感知的 HTTP GET 请求
   */
  httpGet(
    url: string | URL,
    options: http.RequestOptions = {},
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    return this.httpRequest(url, { ...options, method: 'GET' }, callback);
  }

  /**
   * 便捷方法：创建 fetchJson 函数
   * 使用代理感知的 fetch 实现 JSON 请求
   */
  async fetchJson<T = any>(
    url: string,
    options: RequestInit = {},
    headers: Record<string, string> = {}
  ): Promise<T> {
    const proxyAwareFetch = this.createProxyAwareFetch();
    
    const response = await proxyAwareFetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 便捷方法：下载文件
   * 使用代理感知的请求下载文件到指定路径
   */
  async downloadFile(
    url: string,
    destinationPath: string,
    options: {
      headers?: Record<string, string>;
      followRedirects?: boolean;
      maxRedirects?: number;
    } = {}
  ): Promise<void> {
    const { writeFile } = await import('fs/promises');
    const { dirname } = await import('path');
    const { mkdir } = await import('fs/promises');
    
    const proxyAwareFetch = this.createProxyAwareFetch();
    
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = options.maxRedirects ?? 5;
    
    while (redirectCount <= maxRedirects) {
      const response = await proxyAwareFetch(currentUrl, {
        headers: options.headers,
        redirect: 'manual'
      });
      
      if (response.status >= 300 && response.status < 400) {
        if (!options.followRedirects) {
          throw new Error(`Redirect not allowed: ${response.status}`);
        }
        
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect response missing location header');
        }
        
        currentUrl = new URL(location, currentUrl).href;
        redirectCount++;
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // 确保目标目录存在
      const dir = dirname(destinationPath);
      await mkdir(dir, { recursive: true });
      
      // 下载文件
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile(destinationPath, buffer);
      
      return;
    }
    
    throw new Error(`Too many redirects (${maxRedirects})`);
  }
}