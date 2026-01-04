const express = require('express');
const axios = require('axios');
const { wallpaperLimiter } = require('../middleware/security');
const router = express.Router();

// 备用的自然风景图片 ID 列表（来自 picsum.photos 的风景图）
const NATURE_PHOTO_IDS = [
  10, 11, 15, 16, 17, 18, 19, 20, 22, 24, 27, 28, 29, 37, 39, 40, 41, 42, 47, 48,
  49, 50, 53, 54, 55, 56, 57, 58, 59, 60, 62, 63, 64, 66, 67, 68, 69, 71, 73, 74,
  76, 77, 78, 79, 82, 83, 84, 85, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98,
  100, 101, 102, 103, 104, 106, 107, 108, 109, 110, 111, 112, 114, 115, 116, 117,
  118, 119, 120, 122, 123, 124, 125, 126, 127, 128, 129, 131, 132, 133, 134, 135,
  136, 137, 139, 140, 141, 142, 143, 144, 145, 146, 147, 149, 150, 151, 152, 153,
  155, 156, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171,
  172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187,
  188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203,
  204, 206, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221,
  222, 223, 224, 225, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238,
  239, 240, 241, 242, 243, 244, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256,
  257, 258, 259, 260, 261, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273
];

// 记录最近使用的图片ID，避免连续重复
let recentPhotoIds = [];
const MAX_RECENT = 20;

// 获取随机壁纸（每分钟最多15次）
router.get('/random', wallpaperLimiter, async (req, res) => {
  try {
    // 从预选图片中随机选择，避免最近使用过的
    let availableIds = NATURE_PHOTO_IDS.filter(id => !recentPhotoIds.includes(id));
    
    // 如果可用的太少，重置记录
    if (availableIds.length < 10) {
      recentPhotoIds = [];
      availableIds = NATURE_PHOTO_IDS;
    }
    
    const randomIndex = Math.floor(Math.random() * availableIds.length);
    const randomId = availableIds[randomIndex];
    
    // 记录使用过的ID
    recentPhotoIds.push(randomId);
    if (recentPhotoIds.length > MAX_RECENT) {
      recentPhotoIds.shift();
    }
    
    const timestamp = Date.now();
    const wallpaperUrl = `https://picsum.photos/id/${randomId}/1920/1080?_t=${timestamp}`;
    
    res.json({ 
      success: true,
      url: wallpaperUrl 
    });
  } catch (error) {
    // 出错时返回第一张
    const timestamp = Date.now();
    res.json({ 
      success: true,
      url: `https://picsum.photos/id/${NATURE_PHOTO_IDS[0]}/1920/1080?_t=${timestamp}` 
    });
  }
});

module.exports = router;
