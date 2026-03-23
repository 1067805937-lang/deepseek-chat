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
        this.checkAnnouncement();  // 检查公告
        
        // 监听 localStorage 变化（用于实时接收公告）
        window.addEventListener('storage', (e) => {
            if (e.key === 'global_announcement') {
                if (e.newValue) {
                    const announcement = JSON.parse(e.newValue);
                    this.showBanner(announcement.message);
                }
            }
        });
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
                    this.sendBtn.disabled = !this.userInput.value.trim() || !this.getApiKey();
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
                    if (this.userInput.value.trim() && this.getApiKey() && !this.isLoading) {
                        this.sendMessage();
                    }
                }
            });
        }
    }
    
    // ========== 新增：公告相关方法 ==========
    
    // 检查并显示公告
    checkAnnouncement() {
        const saved = localStorage.getItem('global_announcement');
        if (saved) {
            try {
                const announcement = JSON.parse(saved);
                if (announcement.active) {
                    this.showBanner(announcement.message);
                }
            } catch(e) {}
        }
    }
    
    // 显示公告横幅
    showBanner(message) {
        let banner = document.getElementById('globalBanner');
        
        // 如果横幅不存在，创建它
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'globalBanner';
            banner.className = 'global-banner';
            banner.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                max-width: 350px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 1000;
                border-left: 4px solid #10a37f;
                display: none;
            `;
            banner.innerHTML = `
                <div class="banner-content" style="padding: 16px; position: relative;">
                    <div class="banner-message" style="margin-bottom: 12px; font-size: 14px; line-height: 1.5; color: #333; padding-right: 24px;"></div>
                    <div class="banner-reply" style="display: flex; gap: 8px; margin-top: 12px;">
                        <input type="text" id="bannerReplyInput" placeholder="输入回复..." style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                        <button id="sendReplyBtn" style="padding: 8px 16px; background: #10a37f; color: white; border: none; border-radius: 6px; cursor: pointer;">发送回复</button>
                    </div>
                    <button class="banner-close" id="closeBannerBtn" style="position: absolute; top: 8px; right: 8px; background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">×</button>
                </div>
            `;
            document.body.appendChild(banner);
        }
        
        const bannerMessage = banner.querySelector('.banner-message');
        if (bannerMessage) {
            bannerMessage.innerHTML = message;
        }
        
        banner.style.display = 'block';
        
        // 绑定回复功能
        const sendReplyBtn = document.getElementById('sendReplyBtn');
        const replyInput = document.getElementById('bannerReplyInput');
        
        const handleReply = () => {
            const reply = replyInput ? replyInput.value.trim() : '';
            if (reply) {
                this.sendAdminReply(reply);
                if (replyInput) replyInput.value = '';
                banner.style.display = 'none';
            }
        };
        
        if (sendReplyBtn) {
            sendReplyBtn.onclick = handleReply;
        }
        if (replyInput) {
            replyInput.onkeypress = (e) => {
                if (e.key === 'Enter') handleReply();
            };
        }
        
        const closeBtn = document.getElementById('closeBannerBtn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                banner.style.display = 'none';
            };
        }
    }
    
    // 发送回复给管理员
    async sendAdminReply(reply) {
        try {
            await fetch('/api/record/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    visitorId: this.visitorId,
                    reply: reply,
                    timestamp: Date.now()
                })
            });
        } catch (error) {
            console.error('发送回复失败:', error);
        }
    }
    
    // ========== 新增：API Key 相关方法 ==========
    
    // 获取 API Key（优先用户自己的，其次免费 Key）
    getApiKey() {
        let key = localStorage.getItem('deepseek_api_key');
        if (!key) {
            key = localStorage.getItem('free_api_key');
            if (key) {
                this.showApiPrompt('正在使用免费 API Key');
            }
        }
        return key;
    }
    
    // 显示 API 配置提示
    showApiPrompt(message) {
        // 避免重复添加
        if (document.getElementById('api-prompt')) return;
        
        const container = this.chatContainer;
        if (!container) return;
        
        const promptDiv = document.createElement('div');
        promptDiv.id = 'api-prompt';
        promptDiv.className = 'api-prompt';
        promptDiv.style.cssText = `
            text-align: center;
            padding: 40px;
            background: #fef3c7;
            border-radius: 12px;
            margin: 20px auto;
            max-width: 500px;
        `;
        promptDiv.innerHTML = `
            <h3 style="color: #92400e; margin-bottom: 12px;">🔑 需要配置 API Key</h3>
            <p style="color: #b45309; margin-bottom: 16px;">${message || '请点击右上角设置按钮配置您的 API Key'}</p>
            <div class="free-api-info" style="background: white; padding: 12px; border-radius: 8px; margin-top: 16px; font-size: 13px; color: #065f46;">
                💡 提示：管理员已提供免费 API Key，点击下方按钮自动配置<br>
                <button id="useFreeApiBtn" style="margin-top: 10px; background: #10a37f; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">使用免费 API Key</button>
            </div>
        `;
        
        const welcomeScreen = container.querySelector('.welcome-screen');
        if (welcomeScreen) {
            container.insertBefore(promptDiv, welcomeScreen);
        } else {
            container.appendChild(promptDiv);
        }
        
        const useFreeBtn = document.getElementById('useFreeApiBtn');
        if (useFreeBtn) {
            useFreeBtn.onclick = () => {
                const freeKey = localStorage.getItem('free_api_key');
                if (freeKey) {
                    this.apiKey = freeKey;
                    localStorage.setItem('deepseek_api_key', freeKey);
                    this.updateApiStatus(true);
                    promptDiv.remove();
                    this.updateUIState();
                    this.showToast('已启用免费 API Key，开始聊天吧！');
                } else {
                    alert('免费 API Key 暂未配置，请联系管理员');
                }
            };
        }
    }
    
    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #10a37f;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            animation: fadeInOut 2s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }
    
    // ========== 原有方法保持不变 ==========
    
    async initVisitorTracking() {
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
                headers: { 'Content-Type': 'application/json' },
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
                headers: { 'Content-Type': 'application/json' },
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
            // 移除提示
            const prompt = document.getElementById('api-prompt');
            if (prompt) prompt.remove();
        } else {
            alert('请输入有效的 API Key');
        }
    }
    
    loadSavedKey() {
        const key = this.getApiKey();
        if (key) {
            this.apiKey = key;
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
        const hasKey = !!this.getApiKey();
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
        
        // 检查 API Key
        let apiKey = this.getApiKey();
        if (!apiKey) {
            this.showApiPrompt('请先配置 API Key');
            this.openSettings();
            return;
        }
        
        this.apiKey = apiKey;
        
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