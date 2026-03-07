'use client';

import React, { useState, useEffect } from 'react';
import {
    UserCircle,
    Envelope,
    Lock,
    PencilSimple,
    FloppyDisk,
    X,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import type { UserProfile } from '@/lib/api';
import { toast } from 'sonner';

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export default function ProfilePage() {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [saving, setSaving] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    useEffect(() => {
        async function fetchProfile() {
            try {
                const userData = await api.getMe();
                setUser(userData);
                setFirstName(userData.firstName || '');
                setLastName(userData.lastName || '');
            } catch (error) {
                console.error('Failed to fetch profile', error);
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, []);

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const updated = await api.updateProfile({
                firstName,
                lastName,
            });
            setUser(updated);
            setEditing(false);
            toast.success('Profile updated successfully');
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to update profile'));
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmNewPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setSaving(true);
        try {
            await api.changePassword(currentPassword, newPassword);
            setChangingPassword(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
            toast.success('Password changed successfully');
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to change password'));
        } finally {
            setSaving(false);
        }
    };

    const cancelEdit = () => {
        setFirstName(user?.firstName || '');
        setLastName(user?.lastName || '');
        setEditing(false);
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="card animate-shimmer h-20" />
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-5 animate-slide-up">
            {/* Profile Header */}
            <div className="card">
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center text-white font-chivo font-bold text-2xl shadow-lg flex-shrink-0">
                        {user?.firstName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                        <h2 className="font-chivo font-bold text-lg sm:text-xl uppercase tracking-wider">
                            {user?.firstName} {user?.lastName}
                        </h2>
                        <p className="text-slate-400 text-sm font-mono">{user?.email}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded-sm uppercase">
                                {user?.role}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                                Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Personal Information */}
            <div className="card">
                <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="font-chivo font-bold text-sm uppercase tracking-wider">
                        Personal Information
                    </h3>
                    {!editing ? (
                        <button
                            onClick={() => setEditing(true)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-mono uppercase tracking-wider transition-colors"
                        >
                            <PencilSimple size={14} />
                            Edit
                        </button>
                    ) : (
                        <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 text-slate-400 hover:text-slate-300 text-xs font-mono uppercase tracking-wider transition-colors"
                        >
                            <X size={14} />
                            Cancel
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                First Name
                            </label>
                            {editing ? (
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="input-modern"
                                />
                            ) : (
                                <div className="flex items-center gap-2 py-2">
                                    <UserCircle size={18} className="text-slate-500" />
                                    <span className="text-slate-200 font-mono text-sm">{user?.firstName || '—'}</span>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                Last Name
                            </label>
                            {editing ? (
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="input-modern"
                                />
                            ) : (
                                <div className="flex items-center gap-2 py-2">
                                    <UserCircle size={18} className="text-slate-500" />
                                    <span className="text-slate-200 font-mono text-sm">{user?.lastName || '—'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                            Email Address
                        </label>
                        <div className="flex items-center gap-2 py-2">
                            <Envelope size={18} className="text-slate-500" />
                            <span className="text-slate-200 font-mono text-sm">{user?.email}</span>
                        </div>
                    </div>

                    {editing && (
                        <button
                            onClick={handleSaveProfile}
                            disabled={saving}
                            className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                        >
                            <FloppyDisk size={16} />
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    )}
                </div>
            </div>

            {/* Change Password */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-chivo font-bold text-sm uppercase tracking-wider">
                        Security
                    </h3>
                    {!changingPassword && (
                        <button
                            onClick={() => setChangingPassword(true)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-mono uppercase tracking-wider transition-colors"
                        >
                            <Lock size={14} />
                            Change Password
                        </button>
                    )}
                </div>

                {changingPassword ? (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                Current Password
                            </label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="input-modern"
                                placeholder="Enter current password"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                New Password
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="input-modern"
                                placeholder="Min 6 characters"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                Confirm New Password
                            </label>
                            <input
                                type="password"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                className="input-modern"
                                placeholder="Re-enter new password"
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleChangePassword}
                                disabled={saving}
                                className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                            >
                                <Lock size={16} />
                                {saving ? 'Changing...' : 'Update Password'}
                            </button>
                            <button
                                onClick={() => {
                                    setChangingPassword(false);
                                    setCurrentPassword('');
                                    setNewPassword('');
                                    setConfirmNewPassword('');
                                }}
                                className="btn-secondary w-full sm:w-auto"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-slate-500 text-sm">
                        Your password was last set when you created your account. Click &quot;Change Password&quot; to update it.
                    </p>
                )}
            </div>
        </div>
    );
}
