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
                const price = b.price || PRICES[b.category] || 0;
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
            tbody.innerHTML = '<tr><td colspan="7" class="loading">Aucune réservation trouvée</td></tr>';
            return;
        }
        const CATS = { tabac: 'Tabac', drogue: 'Drogue', drogue_dure: 'Drogue dure', drogue_douce: 'Drogue douce', renforcement: 'Renforcement' };
        tbody.innerHTML = bookings.map(b => {
            const statusClass = b.status === 'confirmed' ? 'status-confirmed' : b.status === 'cancelled' ? 'status-cancelled' : 'status-pending';
            const statusLabel = b.status === 'confirmed' ? 'Confirmé' : b.status === 'cancelled' ? 'Annulé' : 'En attente';
            const price = b.price || PRICES[b.category] || 0;
            return '<tr>' +
                '<td>' + formatDate(b.date) + '</td>' +
                '<td>' + formatTime(b.time) + '</td>' +
                '<td>' + (b.client_name || '-') + '</td>' +
                '<td>' + (b.phone || '-') + '</td>' +
                '<td>' + (CATS[b.category] || b.category || '-') + '</td>' +
                '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
                '<td>' + price.toLocaleString(LOCALE) + ' ' + CURRENCY + '</td>' +
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
        const headers = ['Date', 'Heure', 'Nom', 'Téléphone', 'Catégorie', 'Statut', 'Montant (' + CURRENCY + ')'];
        const rows = allBookings.map(b => [
            b.date || '', b.time || '', b.client_name || '', b.phone || '',
            b.category || '', b.status || '', b.price || PRICES[b.category] || 0
        ]);
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
