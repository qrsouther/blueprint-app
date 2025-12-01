const { invoke, view } = require('@forge/bridge');

let currentExcerptId = null;

// Wait for DOM to be ready, then initialize
function initializeApp() {
    console.log('Initializing Blueprint App Source');

    // Load existing config from macro context
    view.getContext().then(context => {
        console.log('Context loaded:', context);

        // Get macro configuration
        const extension = context.extension || {};
        const config = extension.config || {};

        console.log('Existing macro config:', config);

        if (config.excerptId) {
            currentExcerptId = config.excerptId;
            document.getElementById('excerptIdDisplay').style.display = 'block';
            document.getElementById('excerptIdValue').textContent = config.excerptId;
        }

        if (config.excerptName) {
            document.getElementById('excerptName').value = config.excerptName;
        }

        if (config.category) {
            document.getElementById('category').value = config.category;
        }

        if (config.content) {
            document.getElementById('content').value = config.content;
            updateVariablePreview();
        }
    }).catch(error => {
        console.error('Error loading context:', error);
    });

    // Update variable preview
    document.getElementById('content').addEventListener('input', updateVariablePreview);

    // Attach save function to button
    document.getElementById('saveBtn').addEventListener('click', async function() {
        const excerptName = document.getElementById('excerptName').value.trim();
        const category = document.getElementById('category').value;
        const content = document.getElementById('content').value.trim();
        const saveBtn = document.getElementById('saveBtn');

        if (!excerptName || !content) {
            showStatus('error', 'Please fill in all required fields');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            console.log('Invoking saveExcerpt...');

            // Use invoke from @forge/bridge
            const result = await invoke('handler', {
                action: 'saveExcerpt',
                excerptName: excerptName,
                category: category,
                content: content,
                excerptId: currentExcerptId
            });

            console.log('Invoke result:', result);

            if (result.success) {
                currentExcerptId = result.excerptId;

                // Save macro configuration using view.submit
                await view.submit({
                    excerptId: result.excerptId,
                    excerptName: excerptName,
                    category: category,
                    content: content
                });

                document.getElementById('excerptIdDisplay').style.display = 'block';
                document.getElementById('excerptIdValue').textContent = result.excerptId;

                showStatus('success', `Blueprint App "${excerptName}" saved successfully! (ID: ${result.excerptId})`);
            } else {
                showStatus('error', 'Failed to save: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Save error:', error);
            showStatus('error', 'Failed to save excerpt: ' + (error.message || JSON.stringify(error)));
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Blueprint App';
        }
    });
}

function updateVariablePreview() {
    const content = document.getElementById('content').value;
    const variables = extractVariables(content);
    const preview = document.getElementById('variablePreview');

    if (variables.length > 0) {
        preview.style.display = 'block';
        preview.innerHTML = '<Strong>Detected variables:</Strong> ' + variables.join(', ');
    } else {
        preview.style.display = 'none';
    }
}

function extractVariables(content) {
    const regex = /\{\{([^}]+)\}\}/g;
    const variables = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
        const varName = match[1].trim();
        if (!variables.includes(varName)) {
            variables.push(varName);
        }
    }

    return variables;
}

function showStatus(type, message) {
    const status = document.getElementById('status');
    status.className = 'status ' + type;
    status.textContent = message;
    status.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

// Wait for DOM to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already ready
    initializeApp();
}
