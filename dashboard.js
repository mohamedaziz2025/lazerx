// Dashboard JS — LazerX Nabeul
(function() {
    'use strict';

    const CENTER_ID = 'nabeul';
    const CENTER_NAME = 'LazerX Nabeul';
    const CURRENCY = 'DT';
    const TIMEZONE = 'Africa/Tunis';
    const LOCALE = 'fr-TN';

    const PRICES = { tabac: 500, drogue: 750, drogue_dure: 1000, drogue_douce: 600, renforcement: 0 };

    let allBookings = [];
    let categoryChart = null;
    let currentSort = { field: 'date', dir: 'desc' };

    // ─── Auth ───
    const AUTH_KEY = 'lazerx_nabeul_dashboard_auth';
    const AUTH_PIN = '062026';

    function checkAuth() {
        if (localStorage.getItem(AUTH_KEY) === 'true') {
            document.getElementById('authOverlay').style.display = 'none';
            init();
            return;
        }
        document.getElementById('authOverlay').style.display = 'flex';
        const input = document.getElementById('pinInput');
        input.focus();
        input.addEventListener('input', function() {
            if (this.value.length === 6) {
                if (this.value === AUTH_PIN) {
                    localStorage.setItem(AUTH_KEY, 'true');
                    document.getElementById('authOverlay').style.display = 'none';
                    init();
                } else {
                    document.getElementById('pinError').style.display = 'block';
                    this.value = '';
                    setTimeout(() => document.getElementById('pinError').style.display = 'none', 2000);
                    this.focus();
                }
            }
        });
    }

    window.lockSession = function() {
        localStorage.removeItem(AUTH_KEY);
        location.reload();
    };

    // ─── Init ───
    function init() {
        loadStats();
        loadBookings();
        loadEmailConfig();
        loadClientEmails();
        setInterval(() => { loadStats(); loadBookings(); }, 60000);
    }

    // ─── Helpers ───
    function nowInTZ() {
        return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatTime(timeStr) {
        if (!timeStr) return '-';
        return timeStr.substring(0, 5);
    }

    function getWeekRange() {
        const now = nowInTZ();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
    }

    function toISODate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // ─── API ───
    async function apiFetch(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erreur réseau');
        return res.json();
    }

    // ─── Load Stats ───
    async function loadStats() {
        try {
            const { bookings } = await apiFetch('/.netlify/functions/list-bookings?center=' + CENTER_ID);

            const week = getWeekRange();
            const weekStart = toISODate(week.start);
            const weekEnd = toISODate(week.end);
            const weekBookings = bookings.filter(b => b.date >= weekStart && b.date <= weekEnd);

            document.getElementById('kpiWeeklyBookings').textContent = weekBookings.length;

            const totalSlots = 48;
            const fillRate = Math.round((weekBookings.length / totalSlots) * 100);
            document.getElementById('kpiFillRate').innerHTML = fillRate + ' <span class="kpi-unit">%</span>';

            document.getElementById('kpiTotalBookings').textContent = bookings.length;

            let confirmedRevenue = 0, expectedRevenue = 0;
            bookings.forEach(b => {
                const base = b.price || PRICES[b.category] || 0;
                const price = Math.max(0, base - (b.discount || 0));
                if (b.attendance === 'present' || b.status === 'confirmed') confirmedRevenue += price;
                if (b.status !== 'cancelled') expectedRevenue += price;
            });

            document.getElementById('kpiConfirmedRevenue').innerHTML = confirmedRevenue.toLocaleString(LOCALE) + ' <span class="kpi-unit">' + CURRENCY + '</span>';
            document.getElementById('kpiExpectedRevenue').innerHTML = expectedRevenue.toLocaleString(LOCALE) + ' <span class="kpi-unit">' + CURRENCY + '</span>';

            const pending = bookings.filter(b => b.status !== 'cancelled' && !b.attendance).length;
            document.getElementById('kpiPendingSessions').textContent = pending;

            updateCategoryChart(bookings);
        } catch (e) {
            console.error('Erreur stats:', e);
        }
    }

    // ─── Category Chart ───
    function updateCategoryChart(bookings) {
        const cats = {};
        bookings.forEach(b => { const c = b.category || 'autre'; cats[c] = (cats[c] || 0) + 1; });

        const NAMES = { tabac: 'Tabac', drogue: 'Drogue', drogue_dure: 'Drogue dure', drogue_douce: 'Drogue douce', renforcement: 'Renforcement' };
        const COLORS = ['#1e3a8a', '#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#16a34a'];

        const labels = Object.keys(cats).map(c => NAMES[c] || c);
        const data = Object.values(cats);

        const ctx = document.getElementById('categoryChart').getContext('2d');
        if (categoryChart) categoryChart.destroy();

        categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: COLORS.slice(0, labels.length), borderWidth: 0 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 16 } }
                }
            }
        });
    }

    // ─── Load Bookings ───
    async function loadBookings() {
        try {
            const { bookings } = await apiFetch('/.netlify/functions/list-bookings?center=' + CENTER_ID);
            allBookings = (bookings || []).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
            renderBookings(allBookings);
        } catch (e) {
            console.error('Erreur chargement:', e);
            document.getElementById('bookingsBody').innerHTML = '<tr><td colspan="7" class="loading">Erreur de chargement</td></tr>';
        }
    }

    function renderBookings(bookings) {
        const tbody = document.getElementById('bookingsBody');
        if (!bookings.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">Aucune réservation trouvée</td></tr>';
            return;
        }
        const CATS = { tabac: 'Tabac', drogue: 'Drogue', drogue_dure: 'Drogue dure', drogue_douce: 'Drogue douce', renforcement: 'Renforcement' };
        const PAY_LABELS = { especes: '💵 Espèces', cheque: '🧾 Chèque' };
        tbody.innerHTML = bookings.map(b => {
            const statusClass = b.status === 'confirmed' ? 'status-confirmed' : b.status === 'cancelled' ? 'status-cancelled' : 'status-pending';
            const statusLabel = b.status === 'confirmed' ? 'Confirmé' : b.status === 'cancelled' ? 'Annulé' : 'En attente';
            const basePrice = b.price || PRICES[b.category] || 0;
            const net = Math.max(0, basePrice - (b.discount || 0));
            const priceDisplay = b.discount > 0
                ? '<span style="text-decoration:line-through;color:#aaa;font-size:11px;">' + basePrice.toLocaleString(LOCALE) + '</span> ' + net.toLocaleString(LOCALE) + ' ' + CURRENCY
                : net.toLocaleString(LOCALE) + ' ' + CURRENCY;
            return '<tr>' +
                '<td>' + formatDate(b.date) + '</td>' +
                '<td>' + formatTime(b.time) + '</td>' +
                '<td>' + (b.client_name || '-') + '</td>' +
                '<td>' + (b.phone || '-') + '</td>' +
                '<td>' + (b.email || '-') + '</td>' +
                '<td>' + (CATS[b.category] || b.category || '-') + '</td>' +
                '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
                '<td>' + (PAY_LABELS[b.payment_method] || '-') + '</td>' +
                '<td>' + priceDisplay + '</td>' +
                '</tr>';
        }).join('');
    }

    // ─── Filters ───
    window.applyFilters = function() {
        let filtered = [...allBookings];
        const status = document.getElementById('filterStatus').value;
        const category = document.getElementById('filterCategory').value;
        const dateFrom = document.getElementById('filterDateFrom').value;
        const dateTo = document.getElementById('filterDateTo').value;
        const search = document.getElementById('filterSearch').value.toLowerCase();

        if (status) filtered = filtered.filter(b => b.status === status);
        if (category) filtered = filtered.filter(b => b.category === category);
        if (dateFrom) filtered = filtered.filter(b => b.date >= dateFrom);
        if (dateTo) filtered = filtered.filter(b => b.date <= dateTo);
        if (search) filtered = filtered.filter(b =>
            (b.client_name || '').toLowerCase().includes(search) ||
            (b.phone || '').toLowerCase().includes(search)
        );

        renderBookings(filtered);
    };

    window.resetFilters = function() {
        ['filterStatus','filterCategory','filterDateFrom','filterDateTo','filterSearch'].forEach(id => {
            document.getElementById(id).value = '';
        });
        renderBookings(allBookings);
    };

    // ─── Sort ───
    window.sortTable = function(field) {
        if (currentSort.field === field) {
            currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.dir = 'asc';
        }
        const sorted = [...allBookings].sort((a, b) => {
            let vA, vB;
            if (field === 'date') { vA = a.date + a.time; vB = b.date + b.time; }
            else if (field === 'name') { vA = (a.client_name || '').toLowerCase(); vB = (b.client_name || '').toLowerCase(); }
            else if (field === 'revenue') { vA = a.price || PRICES[a.category] || 0; vB = b.price || PRICES[b.category] || 0; }
            else { vA = a[field] || ''; vB = b[field] || ''; }
            if (typeof vA === 'number') return currentSort.dir === 'asc' ? vA - vB : vB - vA;
            return currentSort.dir === 'asc' ? String(vA).localeCompare(String(vB)) : String(vB).localeCompare(String(vA));
        });
        renderBookings(sorted);
    };

    // ─── CSV Export ───
    window.exportCSV = function() {
        const headers = ['Date', 'Heure', 'Nom', 'Téléphone', 'Email', 'Catégorie', 'Statut', 'Paiement', 'Prix (' + CURRENCY + ')', 'Réduction (' + CURRENCY + ')', 'Net (' + CURRENCY + ')'];
        const rows = allBookings.map(b => {
            const base = b.price || PRICES[b.category] || 0;
            const discount = b.discount || 0;
            const net = Math.max(0, base - discount);
            const payLabel = b.payment_method === 'especes' ? 'Espèces' : b.payment_method === 'cheque' ? 'Chèque' : '';
            return [b.date || '', b.time || '', b.client_name || '', b.phone || '', b.email || '', b.category || '', b.status || '', payLabel, base, discount, net];
        });
        let csv = '﻿' + headers.join(';') + '\n';
        rows.forEach(r => { csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\n'; });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = CENTER_ID + '_reservations_' + toISODate(nowInTZ()) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    // ─── Email Config ───
    async function loadEmailConfig() {
        try {
            const saved = localStorage.getItem('lazerx_' + CENTER_ID + '_email_config');
            if (saved) {
                const config = JSON.parse(saved);
                document.getElementById('notifEmail').value = config.email || '';
                document.getElementById('reportFrequency').value = config.frequency || 'weekly';
            }
        } catch (e) {}
    }

    window.saveEmailConfig = function() {
        const config = {
            email: document.getElementById('notifEmail').value,
            frequency: document.getElementById('reportFrequency').value
        };
        localStorage.setItem('lazerx_' + CENTER_ID + '_email_config', JSON.stringify(config));
        const status = document.getElementById('emailSaveStatus');
        status.style.display = 'inline';
        setTimeout(() => status.style.display = 'none', 3000);
    };

    // ─── Newsletter ───
    const NL_MANUAL_KEY   = 'lazerx_' + CENTER_ID + '_nl_manual';
    const NL_EXCLUDED_KEY = 'lazerx_' + CENTER_ID + '_nl_excluded';

    let clientEmails = [];

    function getManualEmails() {
        try { return JSON.parse(localStorage.getItem(NL_MANUAL_KEY) || '[]'); } catch(e) { return []; }
    }
    function saveManualEmails(list) {
        localStorage.setItem(NL_MANUAL_KEY, JSON.stringify(list));
    }
    function getExcluded() {
        try { return new Set(JSON.parse(localStorage.getItem(NL_EXCLUDED_KEY) || '[]')); } catch(e) { return new Set(); }
    }
    function saveExcluded(set) {
        localStorage.setItem(NL_EXCLUDED_KEY, JSON.stringify([...set]));
    }

    function getCombinedList() {
        const excluded = getExcluded();
        const manual   = getManualEmails();
        const manualAddrs = new Set(manual.map(m => m.email.toLowerCase()));
        const fromClients = clientEmails
            .filter(c => !excluded.has(c.email.toLowerCase()) && !manualAddrs.has(c.email.toLowerCase()))
            .map(c => ({ name: c.client_name || '', email: c.email, source: 'client' }));
        const fromManual  = manual.map(m => ({ name: m.name || '', email: m.email, source: 'manual' }));
        return [...fromClients, ...fromManual];
    }

    function renderEmailList() {
        const combined = getCombinedList();
        const badge = document.getElementById('clientEmailCount');
        if (badge) badge.textContent = combined.length + ' email' + (combined.length !== 1 ? 's' : '');

        const tbody = document.getElementById('emailListBody');
        if (!tbody) return;
        if (!combined.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted);">Aucun email dans la liste</td></tr>';
            return;
        }
        tbody.innerHTML = combined.map((c, i) =>
            '<tr>' +
            '<td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (c.name || '—') + '</td>' +
            '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + c.email + '</td>' +
            '<td><span class="source-badge ' + (c.source === 'client' ? 'source-client' : 'source-manual') + '">' +
                (c.source === 'client' ? 'Client' : 'Manuel') + '</span></td>' +
            '<td><button class="btn-remove" onclick="removeEmailFromList(\'' + encodeURIComponent(c.email) + '\',\'' + c.source + '\')" title="Retirer">&#10005;</button></td>' +
            '</tr>'
        ).join('');
    }

    window.loadClientEmails = async function() {
        try {
            const data = await apiFetch('/.netlify/functions/get-client-emails?center=' + CENTER_ID);
            clientEmails = data.emails || [];
        } catch (e) {
            console.error('Erreur chargement emails:', e);
        }
        renderEmailList();
    };

    window.addManualEmail = function() {
        const nameEl  = document.getElementById('newEmailName');
        const emailEl = document.getElementById('newEmailAddr');
        const email = emailEl.value.trim().toLowerCase();
        const name  = nameEl.value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailEl.style.borderColor = '#dc2626';
            setTimeout(() => { emailEl.style.borderColor = ''; }, 2000);
            return;
        }
        const manual = getManualEmails();
        if (manual.find(m => m.email.toLowerCase() === email)) {
            emailEl.style.borderColor = '#d97706';
            setTimeout(() => { emailEl.style.borderColor = ''; }, 2000);
            return;
        }
        const excluded = getExcluded();
        excluded.delete(email);
        saveExcluded(excluded);
        manual.push({ name, email });
        saveManualEmails(manual);
        nameEl.value = '';
        emailEl.value = '';
        renderEmailList();
    };

    window.removeEmailFromList = function(encodedEmail, source) {
        const email = decodeURIComponent(encodedEmail).toLowerCase();
        if (source === 'manual') {
            const manual = getManualEmails().filter(m => m.email.toLowerCase() !== email);
            saveManualEmails(manual);
        } else {
            const excluded = getExcluded();
            excluded.add(email);
            saveExcluded(excluded);
        }
        renderEmailList();
    };

    window.sendNewsletter = async function() {
        const subject  = document.getElementById('newsletterSubject').value.trim();
        const message  = document.getElementById('newsletterMessage').value.trim();
        const statusEl = document.getElementById('newsletterStatus');
        const combined = getCombinedList();

        function showStatus(msg, type) {
            statusEl.textContent = msg;
            statusEl.className = 'newsletter-status ' + type;
            statusEl.style.display = 'inline';
            setTimeout(() => { statusEl.style.display = 'none'; }, 6000);
        }

        if (!subject || !message) return showStatus('Veuillez remplir le sujet et le message.', 'error');
        if (!combined.length)    return showStatus('La liste de destinataires est vide.', 'error');

        try {
            const res = await fetch('/.netlify/functions/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: combined.map(c => c.email), subject, message })
            });
            const data = await res.json();
            if (data.success) {
                showStatus('✓ Envoyé à ' + data.sent + ' destinataire(s)', 'ok');
                document.getElementById('newsletterSubject').value = '';
                document.getElementById('newsletterMessage').value = '';
            } else {
                throw new Error(data.message || 'Erreur inconnue');
            }
        } catch (e) {
            showStatus('✗ Erreur: ' + e.message, 'error');
        }
    };

    // ─── PWA ───
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('pwaInstallBtn').style.display = 'inline-block';
    });

    window.installPWA = function() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
        }
    };

    // ─── Start ───
    document.addEventListener('DOMContentLoaded', checkAuth);
})();
