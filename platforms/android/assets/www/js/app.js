// App initialization
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Handle navigation
    const navLinks = document.querySelectorAll('.bottom-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.getAttribute('href').substring(1);
            navigateToPage(page);
            
            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
    });

    // Load initial page
    navigateToPage('home');
}

function navigateToPage(page) {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = ''; // Clear current content
    
    // Add fade-in animation
    mainContent.classList.remove('fade-in');
    void mainContent.offsetWidth; // Trigger reflow
    mainContent.classList.add('fade-in');

    // Load page content
    switch(page) {
        case 'home':
            loadHomePage(mainContent);
            break;
        case 'search':
            loadSearchPage(mainContent);
            break;
        case 'profile':
            loadProfilePage(mainContent);
            break;
        default:
            loadHomePage(mainContent);
    }
}

function loadHomePage(container) {
    container.innerHTML = `
        <div class="page-content">
            <h2>Welcome to Stratos</h2>
            <p>Your vision, our platform. Let's build something amazing together.</p>
            <div class="featured-section">
                <h3>Featured Startups</h3>
                <div class="startup-grid">
                    <!-- Add your startup cards here -->
                </div>
            </div>
        </div>
    `;
}

function loadSearchPage(container) {
    container.innerHTML = `
        <div class="page-content">
            <div class="search-container">
                <input type="search" placeholder="Search startups..." class="search-input">
            </div>
            <div class="search-results">
                <!-- Search results will be populated here -->
            </div>
        </div>
    `;
}

function loadProfilePage(container) {
    container.innerHTML = `
        <div class="page-content">
            <div class="profile-header">
                <h2>My Profile</h2>
            </div>
            <div class="profile-info">
                <!-- Add profile information here -->
            </div>
        </div>
    `;
} 