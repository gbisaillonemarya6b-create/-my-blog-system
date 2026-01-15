// Supabase配置 - 需要替换为您的实际配置
const SUPABASE_URL = 'https://ynbdktonsfaugfqkbpdi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wIskzxdyJJOK9AzTpevNkQ_At9aH2Ff';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 当前用户
let currentUser = null;

// DOM元素
const pages = {
    register: document.getElementById('register-page'),
    login: document.getElementById('login-page'),
    blog: document.getElementById('blog-page')
};

const navMenu = document.getElementById('nav-menu');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const postForm = document.getElementById('post-form');
const postsContainer = document.getElementById('posts-container');
const createPostBtn = document.getElementById('create-post-btn');
const postModal = document.getElementById('post-modal');
const closeModalBtn = document.querySelector('.close-modal');

// 页面切换
function showPage(pageId) {
    Object.keys(pages).forEach(key => {
        pages[key].classList.remove('active');
    });
    
    if (pages[pageId]) {
        pages[pageId].classList.add('active');
    }
    
    if (pageId === 'blog') {
        loadPosts();
    }
}

// 更新导航
function updateNavigation() {
    navMenu.innerHTML = '';
    
    if (currentUser) {
        navMenu.innerHTML = `
            <li><a href="#" id="nav-blog">博客</a></li>
            <li><a href="#" id="nav-logout">退出 (${currentUser.username})</a></li>
        `;
        
        document.getElementById('nav-blog').addEventListener('click', (e) => {
            e.preventDefault();
            showPage('blog');
        });
        
        document.getElementById('nav-logout').addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    } else {
        navMenu.innerHTML = `
            <li><a href="#" id="nav-register">注册</a></li>
            <li><a href="#" id="nav-login">登录</a></li>
        `;
        
        document.getElementById('nav-register').addEventListener('click', (e) => {
            e.preventDefault();
            showPage('register');
        });
        
        document.getElementById('nav-login').addEventListener('click', (e) => {
            e.preventDefault();
            showPage('login');
        });
    }
}

// 显示消息
function showMessage(elementId, message, isError = true) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.style.display = 'block';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 3000);
}

// 注册
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    // 使用LocalStorage模拟注册（实际应该用Supabase）
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    if (users.some(user => user.email === email)) {
        showMessage('register-error', '邮箱已被注册');
        return;
    }
    
    const newUser = {
        id: Date.now(),
        username,
        email,
        password
    };
    
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    
    currentUser = newUser;
    updateNavigation();
    showPage('blog');
    loadPosts();
    
    showMessage('register-success', '注册成功！', false);
    registerForm.reset();
});

// 登录
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        currentUser = user;
        updateNavigation();
        showPage('blog');
        loadPosts();
        
        showMessage('login-success', '登录成功！', false);
    } else {
        showMessage('login-error', '邮箱或密码错误');
    }
});

// 退出
function logout() {
    currentUser = null;
    updateNavigation();
    showPage('login');
}

// 加载文章
function loadPosts() {
    const posts = JSON.parse(localStorage.getItem('posts') || '[]');
    postsContainer.innerHTML = '';
    
    if (posts.length === 0) {
        postsContainer.innerHTML = '<p>暂无文章，点击"新建文章"按钮创建第一篇。</p>';
        return;
    }
    
    posts.forEach(post => {
        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.innerHTML = `
            <h3 class="post-title">${post.title}</h3>
            <div class="post-content">${post.content.substring(0, 100)}...</div>
            <div class="post-meta">
                作者：${post.author} | ${post.date}
            </div>
        `;
        postsContainer.appendChild(postCard);
    });
}

// 创建文章
createPostBtn.addEventListener('click', () => {
    if (!currentUser) {
        showPage('login');
        return;
    }
    
    postModal.classList.add('active');
});

// 提交文章
postForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    
    const posts = JSON.parse(localStorage.getItem('posts') || '[]');
    const newPost = {
        id: Date.now(),
        title,
        content,
        author: currentUser.username,
        date: new Date().toLocaleDateString()
    };
    
    posts.unshift(newPost);
    localStorage.setItem('posts', JSON.stringify(posts));
    
    postModal.classList.remove('active');
    loadPosts();
    postForm.reset();
});

// 关闭模态框
closeModalBtn.addEventListener('click', () => {
    postModal.classList.remove('active');
});

// 页面链接
document.getElementById('go-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('login');
});

document.getElementById('go-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('register');
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    updateNavigation();
    showPage('login');
    
    // 添加测试数据
    if (!localStorage.getItem('posts')) {
        const testPosts = [
            {
                id: 1,
                title: '欢迎使用博客系统',
                content: '这是一个简单的博客系统，支持用户注册、登录和发布文章。',
                author: '管理员',
                date: '2023-10-01'
            },
            {
                id: 2,
                title: '如何使用本系统',
                content: '1. 注册新账户 2. 登录系统 3. 点击"新建文章"按钮 4. 开始写作',
                author: '管理员',
                date: '2023-10-02'
            }
        ];
        localStorage.setItem('posts', JSON.stringify(testPosts));
    }
});