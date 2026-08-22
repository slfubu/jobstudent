const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbxu4r1cOKJR9Sf8PCh-6EaFOV6KNiotNTUXat3momVVUgiSwDzDwc9kmBOL8tLJIE3PdA/exec" 
};

async function callBackendAPI(functionName, parameters = {}) {
    showLoading();
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: functionName,
                data: parameters
            })
        });
        const result = await response.json();
        hideLoading();
        return result;
    } catch (error) {
        hideLoading();
        showAlert('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
        console.error(error);
        throw error;
    }
}
