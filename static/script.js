// --- START OF FILE script.js ---

document.addEventListener('DOMContentLoaded', async () => {
    const uploadArea = document.querySelector('.upload-area');
    const fileInput = document.getElementById('image-upload');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const promptInput = document.getElementById('prompt-input');
    const apiKeyInput = document.getElementById('api-key-input');
    const generateBtn = document.getElementById('generate-btn');
    const btnText = generateBtn.querySelector('.btn-text');
    const spinner = generateBtn.querySelector('.spinner');
    const resultContainer = document.getElementById('result-image-container');
    const apiKeySection = document.querySelector('.api-key-section');
    const modelSelect = document.getElementById('model-select');
    const modelSubtitle = document.getElementById('model-subtitle');

    let selectedFiles = [];

    try {
        const response = await fetch('/api/key-status');
        if (response.ok) {
            const data = await response.json();
            if (data.isSet) {
                apiKeySection.style.display = 'none';
            }
        }
    } catch (error) {
        console.error("无法检查 API key 状态:", error);
    }

    modelSelect.addEventListener('change', () => {
        modelSubtitle.textContent = `(模型: ${modelSelect.value})`;
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-over'));
    });
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-over'));
    });
    uploadArea.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        handleFiles(files);
    });
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
        handleFiles(files);
    });
    function handleFiles(files) {
        files.forEach(file => {
            if (!selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
                createThumbnail(file);
            }
        });
    }
    function createThumbnail(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'thumbnail-wrapper';
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => {
                selectedFiles = selectedFiles.filter(f => f.name !== file.name);
                wrapper.remove();
            };
            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            thumbnailsContainer.appendChild(wrapper);
        };
        reader.readAsDataURL(file);
    }

    generateBtn.addEventListener('click', async () => {
        if (apiKeySection.style.display !== 'none' && !apiKeyInput.value.trim()) {
            alert('请输入 OpenRouter API 密钥');
            return;
        }
        if (selectedFiles.length === 0) {
            alert('请选择至少一张图片');
            return;
        }
        if (!promptInput.value.trim()) {
            alert('请输入提示词');
            return;
        }

        setLoading(true);
        
        const maxRetries = 3;
        let lastError = '未知错误';

        try {
            const base64Images = await Promise.all(selectedFiles.map(file => fileToBase64(file)));
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (attempt > 1) {
                        updateResultStatus(`仅收到文本，正在重新请求... (第 ${attempt}/${maxRetries} 次)`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        updateResultStatus('正在请求模型...');
                    }

                    const response = await fetch('/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: promptInput.value,
                            images: base64Images,
                            apikey: apiKeyInput.value,
                            model: modelSelect.value
                        })
                    });

                    const data = await response.json();

                    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

                    if (data.imageUrl) {
                        displayResult(data.imageUrl);
                        return; 
                    }
                    
                    if (data.retry) {
                        console.warn(`Attempt ${attempt} failed: ${data.message}`);
                        lastError = `模型连续返回文本，最后一次信息: "${data.message}"`;
                        continue;
                    }

                    throw new Error('收到了未知的服务器响应');

                } catch (error) {
                    console.error(`Attempt ${attempt} failed with error:`, error);
                    lastError = error.message;
                    if (attempt >= maxRetries) {
                        throw new Error(lastError);
                    }
                }
            }

            throw new Error(`尝试 ${maxRetries} 次后仍无法生成图片。` + ` (${lastError})`);

        } catch (error) {
            updateResultStatus(`生成失败: ${error.message}`);
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        generateBtn.disabled = isLoading;
        btnText.textContent = isLoading ? '正在生成...' : '生成';
        spinner.classList.toggle('hidden', !isLoading);
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    function updateResultStatus(text) {
        resultContainer.innerHTML = `<p>${text}</p>`;
    }

    function displayResult(imageUrl) {
        resultContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = '生成的图片';
        resultContainer.appendChild(img);
    }
});

// --- END OF FILE script.js ---
