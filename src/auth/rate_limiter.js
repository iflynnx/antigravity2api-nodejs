import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/logger.js';
import config from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RateLimiter {
    constructor(filePath = path.join(__dirname, '..', '..', 'data', 'usage.json')) {
        this.filePath = filePath;
        this.usage = {}; // { token_prefix: { count: 0, date: 'YYYY-MM-DD' } }
        this.requestCounts = new Map(); // { token_prefix: { count: 0, resetTime: timestamp } }
        this.ensureFileExists();
        this.loadUsage();

        // 定期保存使用量数据 (每分钟)
        setInterval(() => this.saveUsage(), 60000);
    }

    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, '{}', 'utf8');
        }
    }

    loadUsage() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                this.usage = JSON.parse(data);
            }
        } catch (error) {
            log.error('加载 usage.json 失败:', error.message);
            this.usage = {};
        }
    }

    saveUsage() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.usage, null, 2), 'utf8');
        } catch (error) {
            log.error('保存 usage.json 失败:', error.message);
        }
    }

    // 获取今日日期字符串 (YYYY-MM-DD)
    getTodayString() {
        const date = new Date();
        // 使用北京时间
        date.setHours(date.getHours() + 8);
        return date.toISOString().split('T')[0];
    }

    // 检查是否受限
    // 返回 true 表示允许请求，false 表示受限
    checkLimit(token) {
        // 检查是否启用限流
        if (!config.security?.rateLimit?.enabled) {
            return true;
        }

        const maxRPM = config.security.rateLimit.maxRequestsPerMinute || 60;
        const maxDaily = config.security.rateLimit.maxRequestsPerDay || 1000;
        const tokenId = token.refresh_token; // 使用 refresh_token 作为唯一标识

        // 1. 检查 RPM (每分钟请求数)
        const now = Date.now();
        let reqStat = this.requestCounts.get(tokenId);

        // 如果没有记录或已过一分钟，重置
        if (!reqStat || now > reqStat.resetTime) {
            reqStat = { count: 0, resetTime: now + 60000 };
            this.requestCounts.set(tokenId, reqStat);
        }

        if (reqStat.count >= maxRPM) {
            log.warn(`Token ...${token.access_token.slice(-8)} 达到 RPM 限制 (${maxRPM})`);
            return false;
        }

        // 2. 检查每日限额
        const today = this.getTodayString();
        let dailyUsage = this.usage[tokenId];

        // 如果是新的一天或无记录，初始化
        if (!dailyUsage || dailyUsage.date !== today) {
            dailyUsage = { count: 0, date: today };
            this.usage[tokenId] = dailyUsage;
        }

        if (dailyUsage.count >= maxDaily) {
            log.warn(`Token ...${token.access_token.slice(-8)} 达到每日限额 (${maxDaily})`);
            return false;
        }

        return true;
    }

    // 增加请求计数 (在请求成功发送前调用)
    incrementUsage(token) {
        if (!config.security?.rateLimit?.enabled) return;

        const tokenId = token.refresh_token;

        // 增加 RPM 计数
        const reqStat = this.requestCounts.get(tokenId);
        if (reqStat) {
            reqStat.count++;
        }

        // 增加每日计数
        const today = this.getTodayString();
        if (this.usage[tokenId] && this.usage[tokenId].date === today) {
            this.usage[tokenId].count++;
        } else {
            this.usage[tokenId] = { count: 1, date: today };
        }

        // 异步保存 (虽然有定时保存，但为了数据安全也可以根据策略立即保存，这里依靠定时保存)
    }
}

const rateLimiter = new RateLimiter();
export default rateLimiter;
