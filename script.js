// ==================== 配置Supabase ====================
// 请替换成你自己的Supabase项目URL和公钥
const SUPABASE_URL = 'https://ynbdktonsfaugfqkbpdi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wIskzxdyJJOK9AzTpevNkQ_At9aH2Ff';

// 初始化Supabase客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 当前用户状态
let currentUser = null;
let currentViewingPostId = null;
let isEditingPost = false;
let editingPostId = null;

// 管理员邀请码
const ADMIN_INVITE_CODE = 'ADMIN2023';

// ==================== DOM元素引用 ====================
const pages = {
    register: document.getElementById('register-page'),
    login: document.getElementById('login-page'),
    blog: document.getElementById('blog-page')
};

const navMenu = document.getElementById('nav-menu');
const adminBadge = document.getElementById('admin-badge');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const postForm = document.getElementById('post-form');
const postsContainer = document.getElementById('posts-container');
const createPostBtn = document.getElementById('create-post-btn');
const adminPanelBtn = document.getElementById('admin-panel-btn');
const postModal = document.getElementById('post-modal');
const viewPostModal = document.getElementById('view-post-modal');
const closeModalBtns = document.querySelectorAll('.close-modal');
const adminPanel = document.getElementById('admin-panel');
const adminControls = document.getElementById('admin-controls');

// 页面链接
const goToLoginLink = document.getElementById('go-to-login');
const goToRegisterLink = document.getElementById('go-to-register');

// 注册页面的管理员选项
const registerIsAdminCheckbox = document.getElementById('register-is-admin');
const adminInviteCodeInput = document.getElementById('admin-invite-code');

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 检查是否有已登录的用户
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        // 获取用户信息
        await fetchUserProfile(session.user.id);
    } else {
        updateNavigation();
        showPage('login');
    }
    
    // 注册页面管理员选项切换
    registerIsAdminCheckbox.addEventListener('change', function() {
        adminInviteCodeInput.style.display = this.checked ? 'block' : 'none';
    });
});

// ==================== 用户相关函数 ====================

// 获取用户资料
async function fetchUserProfile(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) {
            console.error('获取用户资料失败:', error);
            return null;
        }
        
        currentUser = {
            id: userId,
            username: profile.username,
            email: profile.email,
            isAdmin: profile.is_admin
        };
        
        updateNavigation();
        showPage('blog');
        loadPosts();
        
        return profile;
    } catch (error) {
        console.error('获取用户资料异常:', error);
        return null;
    }
}

// 用户注册
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const isAdmin = document.getElementById('register-is-admin').checked;
    const inviteCode = adminInviteCodeInput.value.trim();
    
    // 验证表单
    if (password.length < 6) {
        showMessage('register-error', '密码长度至少为6个字符');
        return;
    }
    
    // 如果是管理员注册，验证邀请码
    if (isAdmin && inviteCode !== ADMIN_INVITE_CODE) {
        showMessage('register-error', '管理员邀请码错误');
        return;
    }
    
    // 1. 注册Supabase认证用户
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                username: username
            }
        }
    });
    
    if (authError) {
        showMessage('register-error', authError.message);
        return;
    }
    
    // 2. 创建用户资料
    const { error: profileError } = await supabase
        .from('profiles')
        .insert([
            {
                id: authData.user.id,
                username: username,
                is_admin: isAdmin
            }
        ]);
    
    if (profileError) {
        showMessage('register-error', '创建用户资料失败: ' + profileError.message);
        return;
    }
    
    // 注册成功，自动登录
    currentUser = {
        id: authData.user.id,
        username: username,
        email: email,
        isAdmin: isAdmin
    };
    
    updateNavigation();
    showPage('blog');
    loadPosts();
    
    showMessage('register-success', '注册成功！已自动登录。', false);
    registerForm.reset();
    adminInviteCodeInput.style.display = 'none';
    registerIsAdminCheckbox.checked = false;
});

// 用户登录
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    
    if (authError) {
        showMessage('login-error', authError.message);
        return;
    }
    
    // 获取用户资料
    await fetchUserProfile(authData.user.id);
    
    showMessage('login-success', `欢迎回来，${currentUser.username}！`, false);
    loginForm.reset();
});

// 用户退出
async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    updateNavigation();
    showPage('login');
    adminPanel.style.display = 'none';
}

// ==================== 文章相关函数 ====================

// 加载所有文章
async function loadPosts() {
    postsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>加载文章中...</p></div>';
    
    try {
        // 获取文章并关联点赞数和评论数
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select(`
                *,
                likes:likes(count),
                comments:comments(count)
            `)
            .order('created_at', { ascending: false });
        
        if (postsError) throw postsError;
        
        // 获取当前用户的点赞信息
        let userLikes = [];
        if (currentUser) {
            const { data: likesData } = await supabase
                .from('likes')
                .select('post_id')
                .eq('user_id', currentUser.id);
            
            userLikes = likesData || [];
        }
        
        renderPosts(posts, userLikes);
    } catch (error) {
        console.error('加载文章失败:', error);
        postsContainer.innerHTML = '<p style="text-align: center; color: #e74c3c;">加载文章失败，请刷新重试</p>';
    }
}

// 渲染文章列表
function renderPosts(posts, userLikes = []) {
    postsContainer.innerHTML = '';
    
    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = '<p style="text-align: center; width: 100%; padding: 40px; color: #7f8c8d;">暂无博客文章，点击"新建文章"按钮创建第一篇。</p>';
        return;
    }
    
    // 转换时间格式
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN');
    };
    
    posts.forEach(post => {
        const postCard = document.createElement('article');
        postCard.className = 'post-card';
        if (post.author_is_admin) {
            postCard.classList.add('admin-post');
        }
        
        // 检查是否已点赞
        const isLiked = userLikes.some(like => like.post_id === post.id);
        const likesCount = post.likes?.[0]?.count || 0;
        const commentsCount = post.comments?.[0]?.count || 0;
        
        // 生成摘要
        const excerpt = post.excerpt || 
            (post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content);
        
        postCard.innerHTML = `
            <div class="post-header">
                <h3 class="post-title">
                    ${post.title}
                    ${post.author_is_admin ? '<span class="admin-badge">管理员</span>' : ''}
                </h3>
                <div class="post-meta">
                    <span>作者：${post.author_name}</span>
                    <span>${formatDate(post.created_at)}</span>
                </div>
                <div class="post-content">
                    <p class="post-excerpt">${excerpt}</p>
                    <a href="#" class="read-more" data-post-id="${post.id}">阅读全文 &rarr;</a>
                </div>
            </div>
            <div class="post-stats">
                <button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
                    <span class="like-icon">${isLiked ? '❤️' : '🤍'}</span>
                    <span class="like-count">${likesCount}</span> 点赞
                </button>
                <div class="comment-count">
                    <span class="comment-icon">💬</span>
                    <span>${commentsCount}</span> 条评论
                </div>
            </div>
        `;
        
        postsContainer.appendChild(postCard);
    });
    
    // 添加事件监听
    document.querySelectorAll('.read-more').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const postId = parseInt(e.target.getAttribute('data-post-id'));
            viewPost(postId);
        });
    });
    
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!currentUser) {
                showPage('login');
                return;
            }
            
            const postId = parseInt(e.currentTarget.getAttribute('data-post-id'));
            toggleLike(postId);
        });
    });
}

// 点赞/取消点赞
async function toggleLike(postId) {
    try {
        // 检查是否已点赞
        const { data: existingLike } = await supabase
            .from('likes')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', currentUser.id)
            .single();
        
        if (existingLike) {
            // 取消点赞
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('id', existingLike.id);
            
            if (error) throw error;
        } else {
            // 点赞
            const { error } = await supabase
                .from('likes')
                .insert([
                    {
                        post_id: postId,
                        user_id: currentUser.id
                    }
                ]);
            
            if (error) throw error;
        }
        
        // 重新加载文章
        loadPosts();
        
        // 如果正在查看文章，更新视图
        if (currentViewingPostId === postId) {
            updatePostView(postId);
        }
        
        // 更新管理员面板
        if (currentUser.isAdmin) {
            updateAdminPanelStats();
        }
        
    } catch (error) {
        console.error('点赞操作失败:', error);
        alert('操作失败，请重试');
    }
}

// 查看文章详情
async function viewPost(postId) {
    currentViewingPostId = postId;
    
    try {
        // 获取文章详情
        const { data: post, error: postError } = await supabase
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();
        
        if (postError) throw postError;
        
        // 获取点赞数
        const { count: likesCount } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);
        
        // 获取评论数
        const { count: commentsCount } = await supabase
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);
        
        // 获取当前用户是否点赞
        let isLiked = false;
        if (currentUser) {
            const { data: like } = await supabase
                .from('likes')
                .select('id')
                .eq('post_id', postId)
                .eq('user_id', currentUser.id)
                .single();
            
            isLiked = !!like;
        }
        
        // 更新模态框内容
        document.getElementById('view-post-title').textContent = post.title;
        
        document.getElementById('view-post-meta').innerHTML = `
            <span>作者：${post.author_name} ${post.author_is_admin ? '<span class="admin-badge">管理员</span>' : ''}</span>
            <span>发布日期：${new Date(post.created_at).toLocaleDateString('zh-CN')}</span>
        `;
        
        document.getElementById('view-post-content').innerHTML = post.content.replace(/\n/g, '<br>');
        document.getElementById('view-post-likes-count').textContent = likesCount || 0;
        document.getElementById('view-post-comments-count').textContent = commentsCount || 0;
        
        // 更新点赞按钮
        const likeBtn = document.getElementById('view-post-like-btn');
        likeBtn.className = `like-btn ${isLiked ? 'liked' : ''}`;
        likeBtn.setAttribute('data-post-id', postId);
        likeBtn.innerHTML = `<span class="like-icon">${isLiked ? '❤️' : '🤍'}</span> ${likesCount || 0} 点赞`;
        
        // 显示模态框
        viewPostModal.classList.add('active');
        
        // 加载评论
        loadComments(postId);
        
    } catch (error) {
        console.error('加载文章详情失败:', error);
        alert('加载文章失败');
    }
}

// 更新文章视图
async function updatePostView(postId) {
    try {
        // 获取点赞数
        const { count: likesCount } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);
        
        // 获取评论数
        const { count: commentsCount } = await supabase
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);
        
        // 获取当前用户是否点赞
        let isLiked = false;
        if (currentUser) {
            const { data: like } = await supabase
                .from('likes')
                .select('id')
                .eq('post_id', postId)
                .eq('user_id', currentUser.id)
                .single();
            
            isLiked = !!like;
        }
        
        document.getElementById('view-post-likes-count').textContent = likesCount || 0;
        document.getElementById('view-post-comments-count').textContent = commentsCount || 0;
        
        const likeBtn = document.getElementById('view-post-like-btn');
        likeBtn.className = `like-btn ${isLiked ? 'liked' : ''}`;
        likeBtn.innerHTML = `<span class="like-icon">${isLiked ? '❤️' : '🤍'}</span> ${likesCount || 0} 点赞`;
        
    } catch (error) {
        console.error('更新文章视图失败:', error);
    }
}

// 创建/更新文章
postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        alert('请先登录');
        return;
    }
    
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    
    if (!title || !content) {
        alert('标题和内容都不能为空');
        return;
    }
    
    const excerpt = content.length > 100 ? content.substring(0, 100) + '...' : content;
    
    try {
        if (isEditingPost && editingPostId) {
            // 更新文章
            const { error } = await supabase
                .from('posts')
                .update({
                    title,
                    content,
                    excerpt,
                    updated_at: new Date().toISOString()
                })
                .eq('id', editingPostId)
                .eq('author_id', currentUser.id);
            
            if (error) throw error;
            
            alert('文章更新成功！');
        } else {
            // 创建新文章
            const { error } = await supabase
                .from('posts')
                .insert([
                    {
                        title,
                        content,
                        excerpt,
                        author_id: currentUser.id,
                        author_name: currentUser.username,
                        author_is_admin: currentUser.isAdmin
                    }
                ]);
            
            if (error) throw error;
            
            alert('文章发布成功！');
        }
        
        // 关闭模态框
        postModal.classList.remove('active');
        
        // 重新加载文章
        loadPosts();
        
        // 更新管理员面板
        if (currentUser.isAdmin) {
            updateAdminPanelStats();
        }
        
    } catch (error) {
        console.error('保存文章失败:', error);
        alert('保存失败: ' + error.message);
    }
});

// ==================== 评论相关函数 ====================

// 加载评论
async function loadComments(postId) {
    const commentsList = document.getElementById('comments-list');
    commentsList.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>加载评论中...</p></div>';
    
    try {
        const { data: comments, error } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        renderComments(comments);
    } catch (error) {
        console.error('加载评论失败:', error);
        commentsList.innerHTML = '<p style="color: #e74c3c; text-align: center;">加载评论失败</p>';
    }
}

// 渲染评论
function renderComments(comments) {
    const commentsList = document.getElementById('comments-list');
    
    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<p style="color: #7f8c8d; text-align: center; padding: 20px;">暂无评论，快来发表第一条评论吧！</p>';
        return;
    }
    
    commentsList.innerHTML = '';
    
    comments.forEach(comment => {
        const commentElement = document.createElement('div');
        commentElement.className = 'comment';
        
        const canDelete = currentUser && 
            (currentUser.id === comment.user_id || currentUser.isAdmin);
        
        commentElement.innerHTML = `
            <div class="comment-header">
                <div class="comment-author">${comment.author_name}</div>
                <div class="comment-date">${new Date(comment.created_at).toLocaleDateString('zh-CN')}</div>
            </div>
            <div class="comment-content">${comment.content}</div>
            ${canDelete ? 
                `<div class="comment-actions">
                    <button class="delete-comment-btn" data-comment-id="${comment.id}">删除</button>
                </div>` : ''
            }
        `;
        
        commentsList.appendChild(commentElement);
    });
    
    // 添加删除评论事件
    document.querySelectorAll('.delete-comment-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const commentId = parseInt(this.getAttribute('data-comment-id'));
            deleteComment(commentId);
        });
    });
}

// 提交评论
document.getElementById('submit-comment-btn').addEventListener('click', async () => {
    if (!currentUser) {
        showPage('login');
        return;
    }
    
    if (!currentViewingPostId) return;
    
    const content = document.getElementById('new-comment').value.trim();
    
    if (!content) {
        alert('评论内容不能为空');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('comments')
            .insert([
                {
                    post_id: currentViewingPostId,
                    user_id: currentUser.id,
                    author_name: currentUser.username,
                    content
                }
            ]);
        
        if (error) throw error;
        
        // 清空输入框
        document.getElementById('new-comment').value = '';
        
        // 重新加载评论
        loadComments(currentViewingPostId);
        
        // 更新视图
        updatePostView(currentViewingPostId);
        
        // 重新加载文章列表
        loadPosts();
        
        // 更新管理员面板
        if (currentUser.isAdmin) {
            updateAdminPanelStats();
        }
        
    } catch (error) {
        console.error('提交评论失败:', error);
        alert('提交评论失败: ' + error.message);
    }
});

// 删除评论
async function deleteComment(commentId) {
    if (!confirm('确定要删除这条评论吗？')) return;
    
    try {
        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);
        
        if (error) throw error;
        
        // 重新加载评论
        loadComments(currentViewingPostId);
        
        // 更新视图
        updatePostView(currentViewingPostId);
        
        // 重新加载文章列表
        loadPosts();
        
        // 更新管理员面板
        if (currentUser.isAdmin) {
            updateAdminPanelStats();
        }
        
    } catch (error) {
        console.error('删除评论失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// ==================== 管理员功能 ====================

// 更新管理员面板统计
async function updateAdminPanelStats() {
    if (!currentUser || !currentUser.isAdmin) return;
    
    try {
        // 获取文章总数
        const { count: totalPosts } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true });
        
        // 获取用户总数
        const { count: totalUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });
        
        // 获取评论总数
        const { count: totalComments } = await supabase
            .from('comments')
            .select('*', { count: 'exact', head: true });
        
        // 获取点赞总数
        const { count: totalLikes } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true });
        
        // 更新统计卡片
        document.getElementById('total-posts').textContent = totalPosts || 0;
        document.getElementById('total-users').textContent = totalUsers || 0;
        document.getElementById('total-comments').textContent = totalComments || 0;
        document.getElementById('total-likes').textContent = totalLikes || 0;
        
        // 更新文章管理表格
        await updateAdminPostsTable();
        
        // 更新用户管理表格
        await updateAdminUsersTable();
        
    } catch (error) {
        console.error('更新管理员面板失败:', error);
    }
}

// 更新文章管理表格
async function updateAdminPostsTable() {
    try {
        const { data: posts, error } = await supabase
            .from('posts')
            .select(`
                *,
                likes:likes(count),
                comments:comments(count)
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const tableBody = document.getElementById('admin-posts-table');
        tableBody.innerHTML = '';
        
        posts.forEach(post => {
            const likesCount = post.likes?.[0]?.count || 0;
            const commentsCount = post.comments?.[0]?.count || 0;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${post.id}</td>
                <td>${post.title}</td>
                <td>${post.author_name} ${post.author_is_admin ? '<span class="admin-badge">管理员</span>' : ''}</td>
                <td>${likesCount}</td>
                <td>${commentsCount}</td>
                <td>
                    <button class="btn" onclick="editPost(${post.id})" style="padding: 5px 10px; font-size: 0.9rem; margin-right: 5px;">编辑</button>
                    <button class="btn btn-danger" onclick="deletePost(${post.id})" style="padding: 5px 10px; font-size: 0.9rem;">删除</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
        
    } catch (error) {
        console.error('更新文章表格失败:', error);
    }
}

// 更新用户管理表格
async function updateAdminUsersTable() {
    try {
        // 获取所有用户资料
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (profilesError) throw profilesError;
        
        // 获取每个用户的文章数
        const usersWithPostCount = await Promise.all(
            profiles.map(async (profile) => {
                const { count } = await supabase
                    .from('posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('author_id', profile.id);
                
                return {
                    ...profile,
                    post_count: count || 0
                };
            })
        );
        
        const tableBody = document.getElementById('admin-users-table');
        tableBody.innerHTML = '';
        
        usersWithPostCount.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.email || '未获取'}</td>
                <td>${new Date(user.created_at).toLocaleDateString('zh-CN')}</td>
                <td>${user.is_admin ? '<span class="admin-badge">管理员</span>' : '普通用户'}</td>
                <td>${user.post_count}</td>
                <td>
                    ${user.id !== currentUser.id ? 
                        `<button class="btn btn-danger" onclick="deleteUser('${user.id}')" style="padding: 5px 10px; font-size: 0.9rem;">删除</button>` : 
                        '<span style="color: #7f8c8d;">当前用户</span>'
                    }
                </td>
            `;
            tableBody.appendChild(row);
        });
        
    } catch (error) {
        console.error('更新用户表格失败:', error);
    }
}

// 编辑文章
window.editPost = async function(postId) {
    try {
        const { data: post, error } = await supabase
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();
        
        if (error) throw error;
        
        // 检查权限
        if (!currentUser.isAdmin && currentUser.id !== post.author_id) {
            alert('您没有权限编辑此文章');
            return;
        }
        
        isEditingPost = true;
        editingPostId = postId;
        document.getElementById('modal-title').textContent = '编辑文章';
        document.getElementById('post-submit-btn').textContent = '更新文章';
        document.getElementById('post-title').value = post.title;
        document.getElementById('post-content').value = post.content;
        
        postModal.classList.add('active');
        
    } catch (error) {
        console.error('加载文章失败:', error);
        alert('加载文章失败');
    }
};

// 删除文章
window.deletePost = async function(postId) {
    if (!confirm('确定要删除这篇文章吗？此操作不可撤销。')) return;
    
    try {
        // 检查权限（管理员或作者本人）
        const { data: post } = await supabase
            .from('posts')
            .select('author_id')
            .eq('id', postId)
            .single();
        
        if (!currentUser.isAdmin && currentUser.id !== post.author_id) {
            alert('您没有权限删除此文章');
            return;
        }
        
        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', postId);
        
        if (error) throw error;
        
        alert('文章已删除');
        loadPosts();
        updateAdminPanelStats();
        
    } catch (error) {
        console.error('删除文章失败:', error);
        alert('删除失败: ' + error.message);
    }
};

// 删除用户
window.deleteUser = async function(userId) {
    if (!confirm('确定要删除这个用户吗？此操作不可撤销。')) return;
    
    if (userId === currentUser.id) {
        alert('不能删除当前登录的用户');
        return;
    }
    
    try {
        // 注意：删除用户需要通过Supabase Admin API
        // 这里我们只删除用户资料，认证用户需要其他方式删除
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);
        
        if (error) throw error;
        
        alert('用户资料已删除');
        updateAdminPanelStats();
        
    } catch (error) {
        console.error('删除用户失败:', error);
        alert('删除失败: ' + error.message);
    }
};

// ==================== 通用函数 ====================

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
        if (currentUser?.isAdmin) {
            updateAdminPanelStats();
        }
    }
}

// 更新导航
function updateNavigation() {
    navMenu.innerHTML = '';
    
    if (currentUser) {
        let menuItems = `
            <li><a href="#" id="nav-blog" class="active">博客</a></li>
        `;
        
        if (currentUser.isAdmin) {
            menuItems += `<li><a href="#" id="nav-admin">管理面板</a></li>`;
        }
        
        menuItems += `<li><a href="#" id="nav-logout">退出 (${currentUser.username})</a></li>`;
        
        navMenu.innerHTML = menuItems;
        
        document.getElementById('nav-blog').addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav('nav-blog');
            showPage('blog');
            adminPanel.style.display = 'none';
        });
        
        if (currentUser.isAdmin) {
            document.getElementById('nav-admin').addEventListener('click', (e) => {
                e.preventDefault();
                setActiveNav('nav-admin');
                showPage('blog');
                adminPanel.style.display = 'block';
            });
        }
        
        document.getElementById('nav-logout').addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
        
        // 更新管理员徽章
        if (currentUser.isAdmin) {
            adminBadge.classList.add('visible');
            adminControls.style.display = 'flex';
        } else {
            adminBadge.classList.remove('visible');
            adminControls.style.display = 'none';
        }
    } else {
        navMenu.innerHTML = `
            <li><a href="#" id="nav-register">注册</a></li>
            <li><a href="#" id="nav-login" class="active">登录</a></li>
        `;
        
        document.getElementById('nav-register').addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav('nav-register');
            showPage('register');
        });
        
        document.getElementById('nav-login').addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav('nav-login');
            showPage('login');
        });
        
        adminBadge.classList.remove('visible');
        adminControls.style.display = 'none';
    }
}

function setActiveNav(activeId) {
    document.querySelectorAll('#nav-menu a').forEach(link => {
        link.classList.remove('active');
    });
    
    const activeLink = document.getElementById(activeId);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

function showMessage(elementId, message, isError = true) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.style.display = 'block';
    element.className = isError ? 'error-message' : 'success-message';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// 打开创建文章模态框
createPostBtn.addEventListener('click', () => {
    if (!currentUser) {
        showPage('login');
        return;
    }
    
    isEditingPost = false;
    editingPostId = null;
    document.getElementById('modal-title').textContent = '创建新文章';
    document.getElementById('post-submit-btn').textContent = '发布文章';
    document.getElementById('post-title').value = '';
    document.getElementById('post-content').value = '';
    
    postModal.classList.add('active');
});

// 打开管理面板
adminPanelBtn.addEventListener('click', () => {
    adminPanel.style.display = adminPanel.style.display === 'none' ? 'block' : 'none';
    
    if (adminPanel.style.display === 'block' && currentUser?.isAdmin) {
        updateAdminPanelStats();
    }
});

// 关闭模态框
closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        postModal.classList.remove('active');
        viewPostModal.classList.remove('active');
        currentViewingPostId = null;
    });
});

// 点击模态框背景关闭
[postModal, viewPostModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            if (modal === viewPostModal) {
                currentViewingPostId = null;
            }
        }
    });
});

// 页面链接事件监听
goToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveNav('nav-login');
    showPage('login');
});

goToRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveNav('nav-register');
    showPage('register');
});