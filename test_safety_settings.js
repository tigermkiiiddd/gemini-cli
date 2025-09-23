/**
 * 测试 safetySettings 配置是否正常工作
 */

import { Config } from './packages/core/dist/src/config/config.js';
import { createContentGeneratorConfig } from './packages/core/dist/src/core/contentGenerator.js';
import { HarmCategory, HarmBlockThreshold } from '@google/genai';

// 创建一个测试配置
const testConfig = {
  model: {
    name: 'gemini-1.5-flash',
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, 
        threshold: HarmBlockThreshold.BLOCK_NONE
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE
      }
    ]
  },
  apiKey: 'test-key'
};

try {
  // 创建 Config 实例
  const config = new Config({
    sessionId: 'test-session',
    targetDir: process.cwd(),
    debugMode: false,
    safetySettings: testConfig.model.safetySettings,
    model: testConfig.model.name
  });
  
  // 创建 ContentGeneratorConfig
  const contentGenConfig = createContentGeneratorConfig(config);
  
  console.log('✅ 测试通过: Config 创建成功');
  console.log('SafetySettings:', JSON.stringify(contentGenConfig.safetySettings, null, 2));
  
  // 验证 safetySettings 是否正确设置
  if (contentGenConfig.safetySettings && contentGenConfig.safetySettings.length === 4) {
    console.log('✅ 测试通过: safetySettings 配置正确');
    
    // 验证每个设置都是 BLOCK_NONE
    const allBlockNone = contentGenConfig.safetySettings.every(setting => 
      setting.threshold === HarmBlockThreshold.BLOCK_NONE
    );
    
    if (allBlockNone) {
      console.log('✅ 测试通过: 所有安全设置都设为 BLOCK_NONE');
    } else {
      console.log('❌ 测试失败: 安全设置阈值不正确');
    }
  } else {
    console.log('❌ 测试失败: safetySettings 配置不正确');
  }
  
} catch (error) {
  console.error('❌ 测试失败:', error.message);
  console.error(error.stack);
}