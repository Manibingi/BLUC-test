
import React, { useState, useEffect } from 'react';
import { Shield, Users, AlertTriangle, Eye, Ban, CheckCircle } from 'lucide-react';

const AdminDashboard = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchReports();
  }, [statusFilter, currentPage]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/reports/all?status=${statusFilter}&page=${currentPage}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setReports(data.reports);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUser = async (userId, reason = 'Policy violation') => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/reports/block-user/${userId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ reason })
        }
      );

      if (response.ok) {
        alert('User blocked successfully');
        fetchReports();
      }
    } catch (error) {
      console.error('Error blocking user:', error);
    }
  };

  const handleUnblockUser = async (userId) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/reports/unblock-user/${userId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (response.ok) {
        alert('User unblocked successfully');
        fetchReports();
      }
    } catch (error) {
      console.error('Error unblocking user:', error);
    }
  };

  const handleUpdateReport = async (reportId, status, notes = '') => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/reports/update/${reportId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ status, adminNotes: notes })
        }
      );

      if (response.ok) {
        fetchReports();
      }
    } catch (error) {
      console.error('Error updating report:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'reviewed': return 'bg-blue-100 text-blue-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'dismissed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getReportTypeLabel = (type) => {
    const types = {
      'inappropriate_behavior': 'Inappropriate Behavior',
      'harassment': 'Harassment',
      'spam': 'Spam',
      'inappropriate_content': 'Inappropriate Content',
      'other': 'Other'
    };
    return types[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Shield className="h-8 w-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <AlertTriangle className="h-8 w-8 text-yellow-500 mr-3" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {reports.filter(r => r.status === 'pending').length}
                  </p>
                  <p className="text-gray-600">Pending Reports</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {reports.filter(r => r.status === 'resolved').length}
                  </p>
                  <p className="text-gray-600">Resolved Reports</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Ban className="h-8 w-8 text-red-500 mr-3" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {reports.filter(r => r.reportedUser?.isBlocked).length}
                  </p>
                  <p className="text-gray-600">Blocked Users</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">User Reports</h2>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Reports</option>
                <option value="pending">Pending</option>
                <option value="reviewed">Reviewed</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Report Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Reported User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reports.map((report) => (
                  <tr key={report._id}>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {getReportTypeLabel(report.reportType)}
                        </p>
                        <p className="text-sm text-gray-500">{report.description}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(report.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {report.reportedUser?.fullName || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-500">{report.reportedUser?.email}</p>
                        {report.reportedUser?.isBlocked && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mt-1">
                            <Ban size={12} className="mr-1" />
                            Blocked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        {report.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleUpdateReport(report._id, 'reviewed')}
                              className="text-blue-600 hover:text-blue-900 text-sm"
                            >
                              Review
                            </button>
                            <button
                              onClick={() => handleUpdateReport(report._id, 'dismissed')}
                              className="text-gray-600 hover:text-gray-900 text-sm"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                        
                        {!report.reportedUser?.isBlocked ? (
                          <button
                            onClick={() => handleBlockUser(report.reportedUser._id)}
                            className="text-red-600 hover:text-red-900 text-sm"
                          >
                            Block User
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnblockUser(report.reportedUser._id)}
                            className="text-green-600 hover:text-green-900 text-sm"
                          >
                            Unblock
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reports.length === 0 && (
            <div className="text-center py-12">
              <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No reports found</h3>
              <p className="mt-1 text-sm text-gray-500">
                No reports match your current filter.
              </p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
