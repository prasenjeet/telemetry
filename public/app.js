'use strict';

angular.module('telemetryApp', [])
  .controller('TelemetryCtrl', ['$http', '$interval', '$filter', TelemetryCtrl]);

function TelemetryCtrl($http, $interval, $filter) {
  var vm = this;

  vm.events      = [];
  vm.health      = {};
  vm.source      = '';
  vm.warning     = '';
  vm.loading     = false;
  vm.submitting  = false;
  vm.submitMsg   = {};
  vm.limit       = 50;
  vm.lastRefreshed = '';

  vm.form = { eventType: '', deviceId: '', sessionId: '', extra: '' };

  vm.loadHealth = loadHealth;
  vm.loadEvents = loadEvents;
  vm.submitEvent = submitEvent;

  // Initial load
  loadHealth();
  loadEvents();

  // Auto-refresh
  $interval(loadHealth, 10000);
  $interval(loadEvents, 5000);

  // ── Health ────────────────────────────────────────────────────────────────

  function loadHealth() {
    $http.get('/health').then(function(res) {
      vm.health = res.data;
      vm.lastRefreshed = $filter('date')(new Date(), 'HH:mm:ss');
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  function loadEvents() {
    vm.loading = true;
    $http.get('/api/telemetry', { params: { limit: vm.limit } })
      .then(function(res) {
        vm.events  = res.data.events || [];
        vm.source  = res.data.source;
        vm.warning = res.data.warning || '';
      })
      .finally(function() { vm.loading = false; });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function submitEvent() {
    vm.submitMsg = {};

    if (!vm.form.eventType) {
      vm.submitMsg.err = 'Event Type is required.';
      return;
    }

    var payload = { eventType: vm.form.eventType };
    if (vm.form.deviceId)  payload.deviceId  = vm.form.deviceId;
    if (vm.form.sessionId) payload.sessionId = vm.form.sessionId;

    if (vm.form.extra) {
      try {
        var extra = angular.fromJson(vm.form.extra);
        angular.extend(payload, extra);
      } catch (e) {
        vm.submitMsg.err = 'Extra Payload is not valid JSON.';
        return;
      }
    }

    vm.submitting = true;
    $http.post('/api/telemetry', payload)
      .then(function(res) {
        vm.submitMsg.ok = 'Queued — ID: ' + res.data.id;
        vm.form = { eventType: '', deviceId: '', sessionId: '', extra: '' };
        loadEvents();
      })
      .catch(function(err) {
        vm.submitMsg.err = (err.data && err.data.error) || 'Request failed.';
      })
      .finally(function() { vm.submitting = false; });
  }
}
