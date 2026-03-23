class DeepSeekUI {
    constructor() {
        this.apiKey = localStorage.getItem('deepseek_api_key') || '';
        this.messages = [];
        this.currentConversationId = Date.now().toString();
        this.conversations = JSON.parse(localStorage.getItem('conversations') || '{}');
        this.isLoading = false;
        this.currentStreamMessage = null;
        
        // 添加访客追踪
        this.visitorId = null;
        this.initVisitorTracking();
        
        this.config = {
            maxTokens: parseInt(localStorage.getItem('max_tokens') || '4096'),
            temperature: parseFloat(localStorage.getItem('temperature') || '0.7'),
            streamMode: localStorage.getItem('stream_mode') !== 'false'
        };
        
        this.initElements();
        this.bindEvents();
        this.loadConversations();
        this.loadSavedKey();
        this.updateUIState();
    }
    
    // 初始化访客追踪
    async initVisitorTracking() {
        // 获取访客信息
        const visitorInfo = {
            ip: await this.getIP(),
            userAgent: navigator.userAgent,
            device: this.getDeviceInfo(),
            timestamp: Date.now()
        };
        
        try {
            const response = await fetch('/api/record/visit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(visitorInfo)
            });
            
            const data = await response.json();
            this.visitorId = data.id;
            
            // 保存到 localStorage
            localStorage.setItem('visitor_id', this.visitorId);
        } catch (error) {
            console.error('记录访问失败:', error);
        }
    }
    
    // 获取IP地址
    async getIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }
    
    // 获取设备信息
    getDeviceInfo() {
        const ua = navigator.userAgent;
        let device = 'Unknown';
        
        if (/Mobile/i.test(ua)) {
            device = 'Mobile';
        } else if (/Tablet/i.test(ua)) {
            device = 'Tablet';
        } else {
            device = 'Desktop';
        }
        
        // 获取操作系统
        let os = 'Unknown';
        if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Mac/i.test(ua)) os = 'MacOS';
        else if (/Linux/i.test(ua)) os = 'Linux';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
        
        // 获取浏览器
        let browser = 'Unknown';
        if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
        else if (/Firefox/i.test(ua)) browser = 'Firefox';
        else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
        else if (/Edg/i.test(ua)) browser = 'Edge';
        
        return `${device} - ${os} - ${browser}`;
    }
    
    // 记录聊天内容
    async recordChat(message, response) {
        if (!this.visitorId) return;
        
        try {
            await fetch('/api/record/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    visitorId: this.visitorId,
                    message: message,
                    response: response,
                    timestamp: Date.now()
                })
            });
        } catch (error) {
            console.error('记录聊天失败:', error);
        }
    }
    
    // 修改现有的 sendMessage 方法，在发送和接收时添加记录
    async sendMessage() {
        const userInput = this.userInput.value.trim();
        if (!userInput) return;
        
        if (!this.apiKey) {
            this.openSettings();
            return;
        }
        
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.sendBtn.disabled = true;
        this.userInput.disabled = true;
        
        // 隐藏欢迎屏幕
        if (this.messages.length === 0) {
            this.chatContainer.innerHTML = '';
        }
        
        // 添加用户消息
        this.addMessageToUI('user', userInput);
        this.messages.push({ role: 'user', content: userInput });
        
        // 记录用户消息
        await this.recordChat(userInput, null);
        
        this.userInput.value = '';
        this.userInput.style.height = 'auto';
        
        try {
            if (this.config.streamMode) {
                await this.sendStreamMessage();
            } else {
                await this.sendNormalMessage();
            }
            
            // 保存对话
            this.saveCurrentConversation();
            this.loadConversations();
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessageToUI('assistant', `❌ 错误: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.sendBtn.disabled = false;
            this.userInput.disabled = false;
            this.userInput.focus();
            this.updateUIState();
        }
    }
    
    // 修改流式消息方法，添加记录
    async sendStreamMessage() {
        this.addTypingIndicator();
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: this.messages,
                stream: true,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens
            })
        });
        
        if (!response.ok) {
            this.removeTypingIndicator();
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }
        
        this.removeTypingIndicator();
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        messageDiv.appendChild(contentDiv);
        this.chatContainer.appendChild(messageDiv);
        
        let fullContent = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices[0].delta;
                            
                            if (delta && delta.content) {
                                fullContent += delta.content;
                                contentDiv.innerHTML = this.renderMarkdown(fullContent);
                                this.scrollToBottom();
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }
            
            // 记录AI回复
            if (fullContent) {
                const lastUserMessage = this.messages[this.messages.length - 1]?.content;
                await this.recordChat(lastUserMessage, fullContent);
                this.messages.push({ role: 'assistant', content: fullContent });
            }
        } catch (error) {
            contentDiv.innerHTML = `❌ 流式输出错误: ${error.message}`;
            throw error;
        }
    }
    
    // 修改普通消息方法，添加记录
    async sendNormalMessage() {
        this.addTypingIndicator();
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: this.messages,
                stream: false,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens
            })
        });
        
        this.removeTypingIndicator();
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        this.addMessageToUI('assistant', content);
        
        // 记录AI回复
        const lastUserMessage = this.messages[this.messages.length - 1]?.content;
        await this.recordChat(lastUserMessage, content);
        this.messages.push({ role: 'assistant', content: content });
    }
}
class DeepSeekUI {
    constructor() {
        this.apiKey = localStorage.getItem('deepseek_api_key') || '';
        this.messages = [];
        this.currentConversationId = Date.now().toString();
        this.conversations = JSON.parse(localStorage.getItem('conversations') || '{}');
        this.isLoading = false;
        this.currentStreamMessage = null; // 跟踪当前流式消息
        
        this.config = {
            maxTokens: parseInt(localStorage.getItem('max_tokens') || '4096'),
            temperature: parseFloat(localStorage.getItem('temperature') || '0.7'),
            streamMode: localStorage.getItem('stream_mode') !== 'false'
        };
        
        this.initElements();
        this.bindEvents();
        this.loadConversations();
        this.loadSavedKey();
        this.updateUIState();
    }
    
    initElements() {
        this.sidebar = document.getElementById('sidebar');
        this.chatContainer = document.getElementById('chatContainer');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.menuToggle = document.getElementById('menuToggle');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.apiStatus = document.getElementById('apiStatus');
        this.historyList = document.getElementById('historyList');
        
        // 设置模态框元素
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
        this.maxTokensSelect = document.getElementById('maxTokensSelect');
        this.temperatureSlider = document.getElementById('temperature');
        this.tempValue = document.getElementById('tempValue');
        this.streamModeCheck = document.getElementById('streamMode');
        this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
        
        // 快捷操作
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                if (prompt) {
                    this.userInput.value = prompt;
                    this.sendMessage();
                }
            });
        });
    }
    
    bindEvents() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.newChatBtn.addEventListener('click', () => this.newConversation());
        this.menuToggle.addEventListener('click', () => this.toggleSidebar());
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
        this.clearHistoryBtn.addEventListener('click', () => this.clearAllHistory());
        
        // 关闭模态框
        document.querySelector('.modal-close')?.addEventListener('click', () => this.closeSettings());
        window.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });
        
        // 输入框自动调整高度
        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = Math.min(this.userInput.scrollHeight, 200) + 'px';
            this.sendBtn.disabled = !this.userInput.value.trim() || !this.apiKey;
        });
        
        // 配置变更
        this.maxTokensSelect.addEventListener('change', (e) => {
            this.config.maxTokens = parseInt(e.target.value);
            localStorage.setItem('max_tokens', this.config.maxTokens);
        });
        
        this.temperatureSlider.addEventListener('input', (e) => {
            this.config.temperature = parseFloat(e.target.value);
            this.tempValue.textContent = this.config.temperature;
            localStorage.setItem('temperature', this.config.temperature);
        });
        
        this.streamModeCheck.addEventListener('change', (e) => {
            this.config.streamMode = e.target.checked;
            localStorage.setItem('stream_mode', this.config.streamMode);
        });
        
        // Enter发送
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.userInput.value.trim() && this.apiKey && !this.isLoading) {
                    this.sendMessage();
                }
            }
        });
    }
    
    toggleSidebar() {
        this.sidebar.classList.toggle('mobile-open');
        document.querySelector('.main-content').classList.toggle('expanded');
    }
    
    openSettings() {
        this.apiKeyInput.value = this.apiKey;
        this.maxTokensSelect.value = this.config.maxTokens;
        this.temperatureSlider.value = this.config.temperature;
        this.tempValue.textContent = this.config.temperature;
        this.streamModeCheck.checked = this.config.streamMode;
        this.settingsModal.classList.add('active');
    }
    
    closeSettings() {
        this.settingsModal.classList.remove('active');
    }
    
    saveApiKey() {
        const key = this.apiKeyInput.value.trim();
        if (key) {
            this.apiKey = key;
            localStorage.setItem('deepseek_api_key', key);
            this.updateApiStatus(true);
            this.updateUIState();
            this.closeSettings();
        }
    }
    
    loadSavedKey() {
        if (this.apiKey) {
            this.updateApiStatus(true);
        } else {
            this.updateApiStatus(false);
        }
    }
    
    updateApiStatus(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = this.apiStatus?.querySelector('span');
        
        if (connected) {
            statusDot?.classList.add('connected');
            if (statusText) statusText.textContent = 'API已配置';
        } else {
            statusDot?.classList.remove('connected');
            if (statusText) statusText.textContent = '未配置API';
        }
    }
    
    updateUIState() {
        const hasKey = !!this.apiKey;
        if (this.sendBtn) {
            this.sendBtn.disabled = !hasKey || !this.userInput.value.trim() || this.isLoading;
        }
        if (!hasKey) {
            // 不自动打开设置，只是提示
            console.log('请先配置API Key');
        }
    }
    
    newConversation() {
        this.currentConversationId = Date.now().toString();
        this.messages = [];
        this.currentStreamMessage = null;
        this.renderWelcomeScreen();
        this.saveCurrentConversation();
        this.loadConversations();
    }
    
    saveCurrentConversation() {
        if (this.messages.length > 0) {
            const firstMessage = this.messages[0]?.content || '新对话';
            this.conversations[this.currentConversationId] = {
                id: this.currentConversationId,
                title: firstMessage.substring(0, 30),
                messages: JSON.parse(JSON.stringify(this.messages)), // 深拷贝
                timestamp: Date.now()
            };
            localStorage.setItem('conversations', JSON.stringify(this.conversations));
        }
    }
    
    loadConversations() {
        if (!this.historyList) return;
        
        const conversations = Object.values(this.conversations).sort((a, b) => b.timestamp - a.timestamp);
        
        if (conversations.length === 0) {
            this.historyList.innerHTML = '<div style="color: rgba(255,255,255,0.3); text-align: center; padding: 20px;">暂无历史对话</div>';
            return;
        }
        
        this.historyList.innerHTML = conversations.map(conv => `
            <div class="history-item ${conv.id === this.currentConversationId ? 'active' : ''}" data-id="${conv.id}">
                ${this.escapeHtml(conv.title)}
            </div>
        `).join('');
        
        // 绑定点击事件
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => this.loadConversation(item.dataset.id));
        });
    }
    
    loadConversation(id) {
        const conv = this.conversations[id];
        if (conv) {
            this.currentConversationId = id;
            this.messages = JSON.parse(JSON.stringify(conv.messages)); // 深拷贝
            this.currentStreamMessage = null;
            this.renderMessages();
            this.loadConversations();
        }
    }
    
    clearAllHistory() {
        if (confirm('确定要清空所有对话历史吗？此操作不可恢复。')) {
            this.conversations = {};
            localStorage.removeItem('conversations');
            this.newConversation();
            this.loadConversations();
        }
    }
    
    renderWelcomeScreen() {
        this.chatContainer.innerHTML = `
            <div class="welcome-screen">
                <div class="welcome-icon">
                    <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
                        <path d="M16 2L2 9L16 16L30 9L16 2Z" fill="#10A37F" fill-opacity="0.8"/>
                        <path d="M2 9L16 16L30 9L16 23L2 9Z" fill="#10A37F" fill-opacity="0.6"/>
                        <path d="M16 16L30 9L16 23L2 9L16 16Z" fill="#10A37F" fill-opacity="0.4"/>
                    </svg>
                </div>
                <h1>你好，我是 DeepSeek</h1>
                <p>我可以帮你写作、编程、解答问题，或者只是聊聊天</p>
                <div class="quick-actions">
                    <button class="quick-action" data-prompt="帮我写一篇关于人工智能的文章">📝 写文章</button>
                    <button class="quick-action" data-prompt="用Python写一个贪吃蛇游戏">💻 写代码</button>
                    <button class="quick-action" data-prompt="解释一下量子计算">🔬 解答问题</button>
                    <button class="quick-action" data-prompt="给我讲个笑话">😊 轻松一下</button>
                </div>
            </div>
        `;
        
        // 重新绑定快捷操作
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                if (prompt) {
                    this.userInput.value = prompt;
                    this.sendMessage();
                }
            });
        });
    }
    
    renderMessages() {
        if (!this.messages.length) {
            this.renderWelcomeScreen();
            return;
        }
        
        this.chatContainer.innerHTML = '';
        this.messages.forEach(msg => {
            this.addMessageToUI(msg.role, msg.content);
        });
        this.scrollToBottom();
    }
    
    addMessageToUI(role, content, isHtml = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (isHtml) {
            contentDiv.innerHTML = content;
        } else if (role === 'assistant') {
            contentDiv.innerHTML = this.renderMarkdown(content);
        } else {
            contentDiv.innerHTML = this.escapeHtml(content).replace(/\n/g, '<br>');
        }
        
        messageDiv.appendChild(contentDiv);
        this.chatContainer.appendChild(messageDiv);
        
        return messageDiv;
    }
    
    addTypingIndicator() {
        // 移除已存在的指示器
        this.removeTypingIndicator();
        
        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'message assistant';
        indicatorDiv.id = 'typing-indicator';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        indicatorDiv.appendChild(contentDiv);
        this.chatContainer.appendChild(indicatorDiv);
        this.scrollToBottom();
    }
    
    removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }
    
    scrollToBottom() {
        if (this.chatContainer) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }
    
    renderMarkdown(text) {
        if (!text) return '';
        
        let processed = this.escapeHtml(text);
        
        // 代码块
        processed = processed.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="${lang || ''}">${code.trim()}</code></pre>`;
        });
        
        // 行内代码
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // 粗体
        processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // 斜体
        processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // 处理换行和段落
        const paragraphs = processed.split('\n\n');
        if (paragraphs.length > 1) {
            processed = paragraphs.map(p => {
                if (p.includes('<pre>') || p.includes('<code>')) {
                    return p;
                }
                return `<p>${p.replace(/\n/g, '<br>')}</p>`;
            }).join('');
        } else {
            processed = processed.replace(/\n/g, '<br>');
        }
        
        return processed;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    async sendMessage() {
        const userInput = this.userInput.value.trim();
        if (!userInput) return;
        
        if (!this.apiKey) {
            this.openSettings();
            return;
        }
        
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.sendBtn.disabled = true;
        this.userInput.disabled = true;
        
        // 隐藏欢迎屏幕
        if (this.messages.length === 0) {
            this.chatContainer.innerHTML = '';
        }
        
        // 添加用户消息
        this.addMessageToUI('user', userInput);
        this.messages.push({ role: 'user', content: userInput });
        this.userInput.value = '';
        this.userInput.style.height = 'auto';
        
        try {
            if (this.config.streamMode) {
                await this.sendStreamMessage();
            } else {
                await this.sendNormalMessage();
            }
            
            // 保存对话
            this.saveCurrentConversation();
            this.loadConversations();
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessageToUI('assistant', `❌ 错误: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.sendBtn.disabled = false;
            this.userInput.disabled = false;
            this.userInput.focus();
            this.updateUIState();
        }
    }
    
    async sendNormalMessage() {
        this.addTypingIndicator();
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: this.messages,
                stream: false,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens
            })
        });
        
        this.removeTypingIndicator();
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        this.addMessageToUI('assistant', content);
        this.messages.push({ role: 'assistant', content: content });
    }
    
    async sendStreamMessage() {
        // 先添加打字指示器
        this.addTypingIndicator();
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: this.messages,
                stream: true,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens
            })
        });
        
        if (!response.ok) {
            this.removeTypingIndicator();
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }
        
        // 移除打字指示器
        this.removeTypingIndicator();
        
        // 创建新的消息容器用于流式输出
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        messageDiv.appendChild(contentDiv);
        this.chatContainer.appendChild(messageDiv);
        
        let fullContent = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices[0].delta;
                            
                            if (delta && delta.content) {
                                fullContent += delta.content;
                                contentDiv.innerHTML = this.renderMarkdown(fullContent);
                                this.scrollToBottom();
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }
            
            // 流式完成后保存消息
            if (fullContent) {
                this.messages.push({ role: 'assistant', content: fullContent });
            }
        } catch (error) {
            contentDiv.innerHTML = `❌ 流式输出错误: ${error.message}`;
            throw error;
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new DeepSeekUI();
});