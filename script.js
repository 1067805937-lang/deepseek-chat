class DeepSeekUI {
    constructor() {
        this.apiKey = localStorage.getItem('deepseek_api_key') || '';
        this.messages = [];
        this.currentConversationId = Date.now().toString();
        this.conversations = JSON.parse(localStorage.getItem('conversations') || '{}');
        this.isLoading = false;
        this.currentStreamMessage = null;
        
        // 访客追踪
        this.visitorId = localStorage.getItem('visitor_id') || null;
        
        this.config = {
            maxTokens: parseInt(localStorage.getItem('max_tokens') || '4096'),
            temperature: parseFloat(localStorage.getItem('temperature') || '0.7'),
            streamMode: localStorage.getItem('stream_mode') !== 'false'
        };
        
        // 等待 DOM 加载完成后再初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        this.initElements();
        this.bindEvents();
        this.loadConversations();
        this.loadSavedKey();
        this.updateUIState();
        this.initVisitorTracking();
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
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.sendMessage());
        }
        
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => this.newConversation());
        }
        
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        if (this.saveApiKeyBtn) {
            this.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
        }
        
        if (this.clearHistoryBtn) {
            this.clearHistoryBtn.addEventListener('click', () => this.clearAllHistory());
        }
        
        // 关闭模态框
        const modalClose = document.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => this.closeSettings());
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });
        
        // 输入框自动调整高度
        if (this.userInput) {
            this.userInput.addEventListener('input', () => {
                this.userInput.style.height = 'auto';
                this.userInput.style.height = Math.min(this.userInput.scrollHeight, 200) + 'px';
                if (this.sendBtn) {
                    this.sendBtn.disabled = !this.userInput.value.trim() || !this.apiKey;
                }
            });
        }
        
        // 配置变更
        if (this.maxTokensSelect) {
            this.maxTokensSelect.addEventListener('change', (e) => {
                this.config.maxTokens = parseInt(e.target.value);
                localStorage.setItem('max_tokens', this.config.maxTokens);
            });
        }
        
        if (this.temperatureSlider) {
            this.temperatureSlider.addEventListener('input', (e) => {
                this.config.temperature = parseFloat(e.target.value);
                if (this.tempValue) this.tempValue.textContent = this.config.temperature;
                localStorage.setItem('temperature', this.config.temperature);
            });
        }
        
        if (this.streamModeCheck) {
            this.streamModeCheck.addEventListener('change', (e) => {
                this.config.streamMode = e.target.checked;
                localStorage.setItem('stream_mode', this.config.streamMode);
            });
        }
        
        // Enter发送
        if (this.userInput) {
            this.userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (this.userInput.value.trim() && this.apiKey && !this.isLoading) {
                        this.sendMessage();
                    }
                }
            });
        }
    }
    
    async initVisitorTracking() {
        // 如果已经有 visitorId，就不重复记录
        if (this.visitorId) return;
        
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const ipData = await response.json();
            
            const visitorInfo = {
                ip: ipData.ip,
                userAgent: navigator.userAgent,
                device: this.getDeviceInfo(),
                timestamp: Date.now()
            };
            
            const recordResponse = await fetch('/api/record/visit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(visitorInfo)
            });
            
            if (recordResponse.ok) {
                const data = await recordResponse.json();
                this.visitorId = data.id;
                localStorage.setItem('visitor_id', this.visitorId);
            }
        } catch (error) {
            console.error('访客追踪失败:', error);
        }
    }
    
    getDeviceInfo() {
        const ua = navigator.userAgent;
        let device = 'Desktop';
        
        if (/Mobile/i.test(ua)) device = 'Mobile';
        else if (/Tablet/i.test(ua)) device = 'Tablet';
        
        let os = 'Unknown';
        if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Mac/i.test(ua)) os = 'MacOS';
        else if (/Linux/i.test(ua)) os = 'Linux';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
        
        let browser = 'Unknown';
        if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
        else if (/Firefox/i.test(ua)) browser = 'Firefox';
        else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
        else if (/Edg/i.test(ua)) browser = 'Edge';
        
        return `${device} - ${os} - ${browser}`;
    }
    
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
                    timestamp: Date.now(),
                    ip: await this.getIP()
                })
            });
        } catch (error) {
            console.error('记录聊天失败:', error);
        }
    }
    
    async getIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'unknown';
        }
    }
    
    toggleSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.toggle('mobile-open');
            const mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.classList.toggle('expanded');
        }
    }
    
    openSettings() {
        if (this.apiKeyInput) this.apiKeyInput.value = this.apiKey;
        if (this.maxTokensSelect) this.maxTokensSelect.value = this.config.maxTokens;
        if (this.temperatureSlider) this.temperatureSlider.value = this.config.temperature;
        if (this.tempValue) this.tempValue.textContent = this.config.temperature;
        if (this.streamModeCheck) this.streamModeCheck.checked = this.config.streamMode;
        if (this.settingsModal) this.settingsModal.classList.add('active');
    }
    
    closeSettings() {
        if (this.settingsModal) this.settingsModal.classList.remove('active');
    }
    
    saveApiKey() {
        const key = this.apiKeyInput.value.trim();
        if (key) {
            this.apiKey = key;
            localStorage.setItem('deepseek_api_key', key);
            this.updateApiStatus(true);
            this.updateUIState();
            this.closeSettings();
        } else {
            alert('请输入有效的 API Key');
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
            this.sendBtn.disabled = !hasKey || !this.userInput?.value.trim() || this.isLoading;
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
                messages: JSON.parse(JSON.stringify(this.messages)),
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
        
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => this.loadConversation(item.dataset.id));
        });
    }
    
    loadConversation(id) {
        const conv = this.conversations[id];
        if (conv) {
            this.currentConversationId = id;
            this.messages = JSON.parse(JSON.stringify(conv.messages));
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
        if (!this.chatContainer) return;
        
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
        if (!this.chatContainer) return;
        
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
        if (!this.chatContainer) return;
        
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
        this.removeTypingIndicator();
        
        if (!this.chatContainer) return;
        
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
        
        processed = processed.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="${lang || ''}">${code.trim()}</code></pre>`;
        });
        
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
        processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        const paragraphs = processed.split('\n\n');
        if (paragraphs.length > 1) {
            processed = paragraphs.map(p => {
                if (p.includes('<pre>') || p.includes('<code>')) return p;
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
        
        if (this.messages.length === 0) {
            this.chatContainer.innerHTML = '';
        }
        
        this.addMessageToUI('user', userInput);
        this.messages.push({ role: 'user', content: userInput });
        
        await this.recordChat(userInput, null);
        
        this.userInput.value = '';
        this.userInput.style.height = 'auto';
        
        try {
            if (this.config.streamMode) {
                await this.sendStreamMessage();
            } else {
                await this.sendNormalMessage();
            }
            
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
        await this.recordChat(this.messages[this.messages.length - 1]?.content, content);
        this.messages.push({ role: 'assistant', content: content });
    }
    
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
                        } catch (e) {}
                    }
                }
            }
            
            if (fullContent) {
                await this.recordChat(this.messages[this.messages.length - 1]?.content, fullContent);
                this.messages.push({ role: 'assistant', content: fullContent });
            }
        } catch (error) {
            contentDiv.innerHTML = `❌ 错误: ${error.message}`;
            throw error;
        }
    }
}

// 启动应用
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new DeepSeekUI();
    });
} else {
    app = new DeepSeekUI();
}