import React, { useState } from 'react';

import { motion, AnimatePresence } from 'motion/react';

import {

  X,

  Mail,

  Lock,

  User,

  UserCheck,

  GraduationCap,

  ArrowRight,

  CheckCircle2,

  Loader2,

  AlertCircle,

} from 'lucide-react';



import type { UserRole } from '../types';

import { register } from '../services/authApi';



interface RegisterModalProps {

  isOpen: boolean;

  onClose: () => void;

  onSwitchToLogin: () => void;

}



export const RegisterModal: React.FC<RegisterModalProps> = ({

  isOpen,

  onClose,

  onSwitchToLogin,

}) => {

  const [role, setRole] = useState<UserRole>('student');



  const [fullName, setFullName] = useState('');

  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');



  const [isSuccess, setIsSuccess] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const handleRegister = async (e: React.FormEvent) => {

    e.preventDefault();



    if (!fullName.trim() || !email.trim() || !password) {

      return;

    }



    if (password.length < 8) {

      setError('Mật khẩu phải có ít nhất 8 ký tự.');

      return;

    }



    setIsLoading(true);

    setError(null);



    try {
      const normalizedName = fullName.trim().replace(/\s+/g, ' ');
      const normalizedEmail = email.trim().toLowerCase();

      // Ví dụ: "Phạm Thanh Huyền"
      // Keycloak: Last name = "Phạm", First name = "Thanh Huyền"
      const nameParts = normalizedName.split(' ');
      const lastName = nameParts.length > 1 ? nameParts[0] : '';
      const firstName =
        nameParts.length > 1
          ? nameParts.slice(1).join(' ')
          : normalizedName;

      await register({

        // Không có username field trên UI,

        // dùng email làm username trong Keycloak.

        username: normalizedEmail,

        email: normalizedEmail,



        password,



        firstName,

        lastName,



        role: role === 'student'

          ? 'STUDENT'

          : 'TEACHER',

      });



      setIsSuccess(true);

    } catch (err) {

      console.error('Register failed:', err);



      setError(

        'Không thể tạo tài khoản. Vui lòng thử lại.'

      );

    } finally {

      setIsLoading(false);

    }

  };



  const handleReset = () => {

    setIsSuccess(false);

    setError(null);

    onSwitchToLogin();

  };



  return (

    <AnimatePresence>

      {isOpen && (

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">



          {/* Backdrop */}

          <motion.div

            initial={{ opacity: 0 }}

            animate={{ opacity: 1 }}

            exit={{ opacity: 0 }}

            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"

            onClick={isLoading ? undefined : onClose}

          />



          {/* Modal */}

          <motion.div

            initial={{

              opacity: 0,

              scale: 0.95,

              y: 15,

            }}

            animate={{

              opacity: 1,

              scale: 1,

              y: 0,

            }}

            exit={{

              opacity: 0,

              scale: 0.95,

              y: 15,

            }}

            transition={{ duration: 0.2 }}

            className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 z-10"

            id="register-modal"

          >



            {/* Close */}

            <button

              type="button"

              onClick={onClose}

              disabled={isLoading}

              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"

              aria-label="Đóng"

            >

              <X className="w-5 h-5" />

            </button>



            {!isSuccess ? (

              <form

                onSubmit={handleRegister}

                className="space-y-4"

              >



                {/* Header */}

                <div>

                  <h3 className="text-xl font-bold text-slate-900 font-['Space_Grotesk']">

                    Đăng ký tài khoản

                  </h3>



                  <p className="text-xs sm:text-sm text-slate-500 mt-1">

                    Tạo tài khoản mới để tham gia làm bài thi

                    hoặc tạo ngân hàng đề.

                  </p>

                </div>



                {/* Role */}

                <div className="grid grid-cols-2 gap-2 pt-1">



                  <button

                    type="button"

                    disabled={isLoading}

                    onClick={() => setRole('student')}

                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${

                      role === 'student'

                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20'

                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'

                    }`}

                  >

                    <GraduationCap className="w-4 h-4 text-indigo-600" />

                    <span>Học sinh / Sinh viên</span>

                  </button>



                  <button

                    type="button"

                    disabled={isLoading}

                    onClick={() => setRole('faculty')}

                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${

                      role === 'faculty'

                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20'

                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'

                    }`}

                  >

                    <UserCheck className="w-4 h-4 text-indigo-600" />

                    <span>Giảng viên</span>

                  </button>



                </div>



                {/* Fields */}

                <div className="space-y-3">



                  {/* Full name */}

                  <div>

                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">

                      Họ và tên

                    </label>



                    <div className="relative">

                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />



                      <input

                        type="text"

                        required

                        disabled={isLoading}

                        value={fullName}

                        onChange={(e) =>

                          setFullName(e.target.value)

                        }

                        placeholder="Nguyễn Văn A"

                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-900 bg-white shadow-sm disabled:bg-slate-50"

                      />

                    </div>

                  </div>



                  {/* Email */}

                  <div>

                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">

                      Email

                    </label>



                    <div className="relative">

                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />



                      <input

                        type="email"

                        required

                        disabled={isLoading}

                        value={email}

                        onChange={(e) =>

                          setEmail(e.target.value)

                        }

                        placeholder="email@example.com"

                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-900 bg-white shadow-sm disabled:bg-slate-50"

                      />

                    </div>

                  </div>



                  {/* Password */}

                  <div>

                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">

                      Mật khẩu

                    </label>



                    <div className="relative">

                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />



                      <input

                        type="password"

                        required

                        minLength={8}

                        disabled={isLoading}

                        value={password}

                        onChange={(e) =>

                          setPassword(e.target.value)

                        }

                        placeholder="Tối thiểu 8 ký tự"

                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-900 bg-white shadow-sm disabled:bg-slate-50"

                      />

                    </div>

                  </div>



                </div>



                {/* Error */}

                {error && (

                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">

                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />



                    <span>{error}</span>

                  </div>

                )}



                {/* Submit */}

                <div className="pt-2">

                  <button

                    type="submit"

                    disabled={isLoading}

                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"

                  >

                    {isLoading ? (

                      <>

                        <Loader2 className="w-4 h-4 animate-spin" />

                        <span>Đang tạo tài khoản...</span>

                      </>

                    ) : (

                      <>

                        <span>Hoàn tất đăng ký</span>

                        <ArrowRight className="w-4 h-4" />

                      </>

                    )}

                  </button>

                </div>



                {/* Login */}

                <div className="text-center pt-2">

                  <span className="text-xs text-slate-500">

                    Đã có tài khoản?{' '}

                  </span>



                  <button

                    type="button"

                    disabled={isLoading}

                    onClick={onSwitchToLogin}

                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"

                  >

                    Đăng nhập ngay

                  </button>

                </div>



              </form>

            ) : (



              /* Success */

              <div className="space-y-4 text-center py-4">



                <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">

                  <CheckCircle2 className="w-8 h-8" />

                </div>



                <h3 className="text-xl font-bold text-slate-900">

                  Đăng ký thành công!

                </h3>



                <p className="text-sm text-slate-600 leading-relaxed">

                  Tài khoản <strong>{email}</strong> với vai trò{' '}

                  <strong>

                    {role === 'student'

                      ? 'Học sinh / Sinh viên'

                      : 'Giảng viên'}

                  </strong>{' '}

                  đã được khởi tạo. Bạn có thể đăng nhập ngay

                  bây giờ.

                </p>



                <div className="pt-2">

                  <button

                    type="button"

                    onClick={handleReset}

                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"

                  >

                    Đăng nhập ngay

                  </button>

                </div>



              </div>

            )}



          </motion.div>

        </div>

      )}

    </AnimatePresence>

  );

};