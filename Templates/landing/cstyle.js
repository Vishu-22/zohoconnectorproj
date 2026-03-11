document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('menuToggle');
    const mainNav = document.getElementById('mainNav');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => mainNav.classList.toggle('show'));
    }
  
    function showToast(title, message, type = 'info') {
      const toastContainer = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.classList.add('toast', `toast-${type}`);
      let icon = 'info-circle';
      if (type === 'success') icon = 'check-circle';
      if (type === 'error') icon = 'exclamation-circle';
      if (type === 'warning') icon = 'exclamation-triangle';
      toast.innerHTML = `
        <div class="toast-icon"><i class="fas fa-${icon}"></i></div>
        <div class="toast-content">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
      `;
      toastContainer.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
      }, 5000);
    }
  
    // Fade-in on scroll
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('fade-in');
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
  
    // FAQ toggle
    document.querySelectorAll('.faq-item').forEach(item => {
      item.addEventListener('click', () => {
        const answer = item.querySelector('.faq-answer');
        answer.style.display = (answer.style.display === 'block') ? 'none' : 'block';
      });
    });
  
    // Chatbot
    const chatbotToggle = document.getElementById('chatbotToggle');
    const chatbot = document.getElementById('chatbot');
    const closeChat = document.getElementById('closeChat');
    const sendChat = document.getElementById('sendChat');
    const chatInput = document.getElementById('chatInput');
    const chatbotMessages = document.getElementById('chatbotMessages');
  
    chatbotToggle.addEventListener('click', () => {
      chatbot.style.display = 'flex';
      chatbotToggle.style.display = 'none';
    });
  
    closeChat.addEventListener('click', () => {
      chatbot.style.display = 'none';
      chatbotToggle.style.display = 'flex';
    });
  
    sendChat.addEventListener('click', () => {
      const msg = chatInput.value.trim();
      if (!msg) return;
      const userMsg = document.createElement('p');
      userMsg.style.textAlign = 'right';
      userMsg.innerHTML = `<strong>You:</strong> ${msg}`;
      chatbotMessages.appendChild(userMsg);
      chatInput.value = '';
  
      setTimeout(() => {
        const botMsg = document.createElement('p');
        botMsg.innerHTML = `<strong>Assistant:</strong> I'm here to help! For Zoho authentication, please ensure your credentials are correct and your redirect URI is authorized.`;
        chatbotMessages.appendChild(botMsg);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
      }, 1000);
    });
  });
  
  function subscribeNewsletter(event) {
    event.preventDefault();
    const email = event.target.querySelector('input[type="email"]').value;
  
    // Here you would typically send this to your backend
    console.log('Newsletter subscription for:', email);
  
    // Show success message
    const form = event.target;
    const formGroup = form.querySelector('.form-group');
  
    const successMessage = document.createElement('div');
    successMessage.className = 'newsletter-success';
    successMessage.innerHTML = '<i class="fas fa-check-circle"></i> Thank you for subscribing!';
    successMessage.style.color = '#4caf50';
    successMessage.style.padding = '10px 0';
    successMessage.style.fontSize = '0.9rem';
    successMessage.style.display = 'flex';
    successMessage.style.alignItems = 'center';
    successMessage.style.justifyContent = 'center';
    successMessage.style.gap = '5px';
  
    form.appendChild(successMessage);
    form.querySelector('input[type="email"]').value = '';
  
    // Remove the message after 3 seconds
    setTimeout(() => {
      successMessage.remove();
    }, 3000);
  }
  

  document.addEventListener('DOMContentLoaded', function() {
    const appImages = document.querySelectorAll('.app-image');
  
    appImages.forEach(image => {
      image.addEventListener('mouseover', function() {
        image.classList.add('hovered');
      });
  
      image.addEventListener('mouseout', function() {
        image.classList.remove('hovered');
      });
    });
  });
  
  // Intersection Observer for fade-in animations
document.addEventListener('DOMContentLoaded', () => {
  const fadeElements = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.2
  });

  fadeElements.forEach(element => {
    observer.observe(element);
  });

  // Mastering card hover enhancement
  const cards = document.querySelectorAll('.mastering-card');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.backgroundColor = 'rgba(78, 95, 247, 0.05)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.backgroundColor = 'var(--white)';
    });
  });
});

// Intersection Observer for fade-in animations
document.addEventListener('DOMContentLoaded', () => {
  const fadeElements = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.2
  });

  fadeElements.forEach(element => {
    observer.observe(element);
  });

  // Stat hover enhancement
  const stats = document.querySelectorAll('.stat');
  stats.forEach(stat => {
    stat.addEventListener('mouseenter', () => {
      stat.style.backgroundColor = 'rgba(78, 95, 247, 0.05)';
    });
    stat.addEventListener('mouseleave', () => {
      stat.style.backgroundColor = 'var(--white)';
    });
  });
});


// Intersection Observer for fade-in animations
document.addEventListener('DOMContentLoaded', () => {
  const fadeElements = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.2
  });

  fadeElements.forEach(element => {
    observer.observe(element);
  });

  // Stat-box hover enhancement
  const stats = document.querySelectorAll('.stat-box');
  stats.forEach(stat => {
    stat.addEventListener('mouseenter', () => {
      stat.style.backgroundColor = 'rgba(78, 95, 247, 0.05)';
    });
    stat.addEventListener('mouseleave', () => {
      stat.style.backgroundColor = 'var(--white)';
    });
  });
});