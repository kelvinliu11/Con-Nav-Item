import { DEFAULT_NAV_SERVER_URL } from './config.js';

// 检查模式和配置
chrome.storage.sync.get(['newtabMode', 'navUrl', 'offlineHtml'], function(result) {
    const mode = result.newtabMode || 'nav';
    
    if (mode === 'quickaccess') {
        window.location.href = 'quickaccess.html';
        return;
    }
    
    const navFrame = document.getElementById('navFrame');
    const loadingScreen = document.getElementById('loadingScreen');
    
    const navUrl = result.navUrl || DEFAULT_NAV_SERVER_URL;
    
    loadingScreen.classList.add('show');
    
    navFrame.src = navUrl;
    
    navFrame.onload = function() {
        setTimeout(function() {
            loadingScreen.classList.remove('show');
            navFrame.style.display = 'block';
            setTimeout(function() {
                navFrame.classList.add('loaded');
            }, 50);
        }, 300);
    };
    
    navFrame.onerror = function() {
        loadOfflineVersion(result.offlineHtml);
    };
    
    setTimeout(function() {
        if (loadingScreen.classList.contains('show')) {
            loadOfflineVersion(result.offlineHtml);
        }
    }, 10000);
});

// 加载离线版本
function loadOfflineVersion(offlineHtml) {
    const navFrame = document.getElementById('navFrame');
    const loadingScreen = document.getElementById('loadingScreen');
    
    loadingScreen.classList.remove('show');
    
    if (offlineHtml) {
        // 使用保存的离线 HTML
        navFrame.srcdoc = offlineHtml;
        navFrame.style.display = 'block';
        setTimeout(function() {
            navFrame.classList.add('loaded');
        }, 50);
    } else {
        // 没有离线版本,显示提示
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:white;font-size:18px;">网络连接失败,且未缓存离线版本</div>';
    }
}


