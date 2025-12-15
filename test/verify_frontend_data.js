import tokenManager from '../src/auth/token_manager.js';
import { log } from '../src/utils/logger.js';

async function verifyApiExpose() {
    console.log('--- 验证 API 数据暴露 ---');
    const tokens = tokenManager.getTokenList();
    if (tokens.length > 0) {
        // 先手动冷冻一个以便观察
        const token = tokens[0];
        console.log(`冷冻 Token: ...${token.access_token.slice(-8)}`);
        tokenManager.suspendToken(token, 120000); // 2 mins

        // 再次获取列表
        const updatedTokens = tokenManager.getTokenList();
        const target = updatedTokens.find(t => t.refresh_token === token.refresh_token);

        console.log('suspend_until 字段值:', target.suspend_until);

        if (target.suspend_until && target.suspend_until > Date.now()) {
            console.log('✅ 测试通过: suspend_until 字段存在且有效');
            console.log('剩余时间 (ms):', target.suspend_until - Date.now());
        } else {
            console.error('❌ 测试失败: suspend_until 字段缺失或无效');
        }
    } else {
        console.warn('无 Token 可测试');
    }
}

verifyApiExpose();
